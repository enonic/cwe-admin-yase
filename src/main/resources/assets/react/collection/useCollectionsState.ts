import type {
	TaskInfo,
	TaskStateType
} from '@enonic-types/lib-task';
import {useWhenInitAsync} from '@seamusleahy/init-hooks';
import type {StrictTableHeaderCellProps} from 'semantic-ui-react';
import type {
	Collector,
	ContentTypeOptions,
	SiteOptions
} from '@enonic-types/lib-explorer/Collector.d';
import type {CollectorComponents} from '../index.d';
import type {
	DropdownItemsWithKeys,
	QueryCollectionsGraph
} from './index.d';


import {
	COLON_SIGN,
	TASK_STATE_RUNNING,
	TASK_STATE_WAITING,
} from '@enonic/js-utils';
import * as gql from 'gql-query-builder-ts';
import { useManualQuery } from 'graphql-hooks';
import * as React from 'react';
import {useInterval} from '../utils/useInterval';
import {useUpdateEffect} from '../utils/useUpdateEffect';
import { set } from 'lodash';


interface FetchCollectionsData {
	queryCollections: QueryCollectionsGraph
}

interface FetchOnUpdateData {
	listScheduledJobs: {
		collectionId: string
		descriptor: string
		enabled: boolean
		schedule: {
			timeZone: string
			type: string
			value: string
		}
	}[]
	queryCollections: QueryCollectionsGraph
	queryCollectors: {
		count: number
		hits: Collector[]
		total: number
	}
	queryDocumentTypes: {
		hits: {
			_id: string
			_name: string
		}[]
	}
	queryFields: {
		count: number
		hits: {
			_name: string
			key: string
		}[]
		total: number
	}
	queryTasks: TaskInfo[]
}

type FetchOnMountData = FetchOnUpdateData & {
	getLocales: {
		country?: string
		displayName: string
		tag: string
	}[]
}

interface FetchTasksData {
	queryTasks: TaskInfo[]
}


const COLLECTIONS_GQL = `queryCollections(
	aggregations: {
		name: "language"
		terms: {
			field: "language"
		}
	}
	perPage: -1
) {
	aggregationsAsJson
	total
	count
	page
	pageStart
	pageEnd
	pagesTotal
	hits {
		_id
		_name
		_path
		collector {
			name
			configJson
			managedDocumentTypes
		}
		documentCount
		language
		documentTypeId
	}
}`;

const COLLECTIONS_GQL_2 = gql.query({
	operation: 'queryCollections',
	variables: {
		aggregations: {
			list: false,
			required: false,
			type: 'AggregationInput',
		},
		filters: {
			list: true,
			required: false,
			type: 'FilterInput',
		},
		page: {
			list: false,
			required: false,
			type: 'Int',
		},
		perPage: {
			list: false,
			required: false,
			type: 'Int',
		},
		query: {
			list: false,
			required: false,
			type: 'String'
		},
		sort: {
			list: false,
			required: false,
			type: 'String'
		}
	},
	fields: [
		'aggregationsAsJson',
		'total',
		'count',
		'page',
		'pageStart',
		'pageEnd',
		'pagesTotal',
		{
			hits: [
				'_id',
				'_name',
				'_path',
				{
					collector: [
						'name',
						'configJson',
						'managedDocumentTypes'
					]
				},
				'documentCount',
				'language',
				'documentTypeId'
			]
		},
	]
});

const COLLECTORS_GQL = `queryCollectors {
	total
	count
	hits {
		appName
		componentPath
		configAssetPath
		displayName
		taskName
	}
}`;

const FIELDS_GQL = `queryFields {
	total
	count
	hits {
		_name
		key
	}
}`;

const JOBS_GQL = `listScheduledJobs {
	collectionId
	enabled
	descriptor
	schedule {
		timeZone
		type
		value
	}
}`;

const LOCALES_GQL = `getLocales {
	country
	displayName
	tag
}`;

const GQL_DOCUMENT_TYPES_QUERY = `queryDocumentTypes {
	hits {
		_id
		_name
	}
}`;

/*const GQL_QUERY_TASKS_GET = `query GetTasks(
	$appName: String
	$descriptor: String,
	$onlyRegisteredCollectorTasks: Boolean,
	$state: EnumTaskStates
) {
	queryTasks(
		appName: $appName
		name: $descriptor
		onlyRegisteredCollectorTasks: $onlyRegisteredCollectorTasks
		state: $state
	) {
		application
		description
		id
		name
		progress {
			current
			info # Can be JSON
			total
		}
		startTime
		state
		user
	}
}`;*/

const GQL_QUERY_QUERY_TASKS = gql.query({
	operation: 'queryTasks',
	fields: [
		'application',
		'description',
		'id',
		'name'	,
		{
			progress: [
				'current',
				'info',
				'total'
			]
		},
		'startTime',
		'state',
		'user'
	]
});

const TASKS_GQL = `queryTasks {
	application
	description
	id
	name
	progress {
		current
		info # Can be JSON
		total
	}
	startTime
	state
	user
}`;

/*
${CONTENT_TYPES_GQL}
${SITES_GQL}
*/

const MOUNT_GQL = `{
	${COLLECTIONS_GQL}
	${COLLECTORS_GQL}
	${FIELDS_GQL}
	${JOBS_GQL}
	${LOCALES_GQL}
	${GQL_DOCUMENT_TYPES_QUERY}
	${TASKS_GQL}
}`;

const UPDATE_GQL = `{
	${COLLECTIONS_GQL}
	${COLLECTORS_GQL}
	${FIELDS_GQL}
	${JOBS_GQL}
	${GQL_DOCUMENT_TYPES_QUERY}
	${TASKS_GQL}
}`;


export function useCollectionsState({
	collectorComponents,
	servicesBaseUrl
}: {
	collectorComponents: CollectorComponents
	servicesBaseUrl: string
}) {
	const [isLoading, setIsLoading] = React.useState(false);
	const [isBlurred, internalSetBlurred] = React.useState(false);

	function setBlurred(blurred: boolean) {
		if (blurred) { // Show right away
			internalSetBlurred(blurred);
		} else { // Wait X ms when removing
			setTimeout(() => {
				internalSetBlurred(blurred);
			}, 400);
		}
	}

	const [jobsObj, setJobsObj] = React.useState({});
	const [locales, setLocales] = React.useState([]);
	const [queryCollectionsGraph, setQueryCollectionsGraph] = React.useState<QueryCollectionsGraph>({
		count: 0,
		hits: [],
		total: 0
	});
	const [queryCollectorsGraph, setQueryCollectorsGraph] = React.useState<{
		count: number
		hits: Array<Collector>
		total: number
	}>({
		count: 0,
		hits: [],
		total: 0
	});
	const [collectorIdToDisplayName, setCollectorIdToDisplayName] = React.useState({});
	const [queryFieldsGraph, setQueryFieldsGraph] = React.useState({
		count: 0,
		hits: [],
		total: 0
	});
	const [documentTypes, setDocumentTypes] = React.useState([]);

	const [showCollector, setShowCollector] = React.useState(true);
	const [showDelete, setShowDelete] = React.useState(true);
	const [showDocumentCount/*, setShowDocumentCount*/] = React.useState(true);
	const [showLanguage, setShowLanguage] = React.useState(true);
	const [showInterfaces, setShowInterfaces] = React.useState(false);
	const [showDocumentType, setShowDocumentType] = React.useState(true);
	const [showSchedule, setShowSchedule] = React.useState(true);
	const [tasks, setTasks] = React.useState<TaskInfo[]>([]);
	const [copyModalCollectionId, setCopyModalCollectionId] = React.useState<string>();

	const fieldsObj = {};
	queryFieldsGraph.hits ? queryFieldsGraph.hits.forEach(({
		//displayName: fieldLabel,
		key
	}) => {
		fieldsObj[key] = {
			label: key
		};
		/*return {
			key,
			label: displayName
		};*/
	}): [];

	const collectorsObj = {};
	const collectorOptions: DropdownItemsWithKeys<string> = queryCollectorsGraph.hits
		? queryCollectorsGraph.hits.map(({
			appName,
			taskName,
			//_name: key,
			displayName: text
		}) => {
			collectorsObj[`${appName}:${taskName}`] = true;
			return {
				key: `${appName}:${taskName}`,
				text,
				value: `${appName}:${taskName}`
			};
		})
		: [];

	const collectionsTaskState = {} as {
		currentTime: number // To compare which is the last one
		state: TaskStateType
	};
	let anyTaskWithoutCollectionName = false;
	const objCollectionsBeingReindexed = {};
	let anyReindexTaskWithoutCollectionId = false;
	tasks.forEach(({
		name: taskDescriptor,
		progress: {
			current,
			info,
			total
		},
		state
	}) => {
		if (collectorsObj[taskDescriptor]) { // This is a collector task
			try {
				const {
					currentTime = 0, // Defaulting to 0 to be able to compare, when missing
					name
				} = JSON.parse(info);
				if (name) {
					// NOTE: Assuming there is only one task in either WAITING or RUNNING state for each collection.
					if ([TASK_STATE_RUNNING, TASK_STATE_WAITING].includes(state)) {
						collectionsTaskState[name] = {
							currentTime: 9999999999999,
							state
						};
					}
					// At this point state is either FINISHED or FAILED
					if (collectionsTaskState[name]) { // More than one task for this collection in the list of tasks.
						if (currentTime > collectionsTaskState[name].currentTime) {
							collectionsTaskState[name] = {
								currentTime,
								state
							};
						}
					} else { // First task for this collection in the list of tasks.
						collectionsTaskState[name] = {
							currentTime,
							state
						};
					}
				} else {
					anyTaskWithoutCollectionName = true;
				}
			} catch (e) {
				// This happens while a collector task is beeing started.
				// This can also happen when a collector task is finished with errors.
				if ([TASK_STATE_WAITING, TASK_STATE_RUNNING].includes(state)) {
					anyTaskWithoutCollectionName = true;
				}
			}
		} else if (taskDescriptor === `com.enonic.app.explorer${COLON_SIGN}reindexCollection`) {
			try {
				const {collectionId} = JSON.parse(info);
				if (collectionId) {
					objCollectionsBeingReindexed[collectionId] = {
						current,
						//percent: Math.floor(current / total * 10000)/100, // Keeping two decimals,
						state,
						total
					};
				} else {
					anyReindexTaskWithoutCollectionId = true;
				}
			} catch (e) {
				anyReindexTaskWithoutCollectionId = true;
			}
		} /*else { // Not collector nor reindex task
			console.debug('taskDescriptor', taskDescriptor);
		}*/
	});
	//console.debug('anyReindexTaskWithoutCollectionId',anyReindexTaskWithoutCollectionId);

	const intInitializedCollectorComponents = Object.keys(collectorComponents).length;

	const [state/*, setState*/] = React.useState({
		column: '_name',
		contentTypeOptions: [],
		direction: 'ascending',
		page: 1,
		perPage: 10,
		siteOptions: [],
		sort: '_name ASC'
	} as {
		column: string
		contentTypeOptions: ContentTypeOptions
		direction: StrictTableHeaderCellProps['sorted']
		siteOptions: SiteOptions
	});

	const [deleteCollectionModalState, setDeleteCollectionModalState] = React.useState({
		collectionId: '',
		collectionName: '',
		open: false,
	});

	const {
		column,
		contentTypeOptions,
		direction,
		siteOptions
	} = state;

	function setJobsObjFromArr(arr: Array<{
		collectionId: string
		enabled: boolean
		schedule: {
			type: string
			value: string
		}
	}>) {
		const obj={};
		arr.forEach(({
			collectionId,
			//collectionName,
			enabled,
			schedule: {
				type,
				//timeZone,
				value
			}
		}) => {
			if (type === 'CRON') {
				if(obj[collectionId]) {
					obj[collectionId].push({enabled, value});
				} else {
					obj[collectionId] = [{enabled, value}];
				}
			}
		});
		setJobsObj(obj);
	} // jobsObjFromArr

	const [languageOptions, setLanguageOptions] = React.useState<{
		text: string
		value: string
	}[]>([]);
	console.debug('languageOptions', languageOptions);

	const [ _fetchOnMount ] = useManualQuery<FetchOnMountData>(MOUNT_GQL);
	function fetchOnMount() {
		// setBlurred(true); // No need for blurring when table is not visible
		setIsLoading(true);
		_fetchOnMount().then(res => {
			if (res && res.data) {
				if (res.data.queryCollections.aggregationsAsJson) {
					setLanguageOptions(res.data.queryCollections.aggregationsAsJson['language']['buckets'].map(({
						docCount,
						key
					}) => ({
						text: `${key} (${docCount})`,
						value: key
					})));
				}
				setLocales(res.data.getLocales);
				setQueryCollectionsGraph(res.data.queryCollections);
				setQueryCollectorsGraph(res.data.queryCollectors);
				setQueryFieldsGraph(res.data.queryFields);
				setJobsObjFromArr(res.data.listScheduledJobs);
				setDocumentTypes(res.data.queryDocumentTypes.hits);
				setTasks(res.data.queryTasks);
				// setBlurred(false);
				setIsLoading(false);
			} // if
		});
	}

	const [ _fetchOnUpdate ] = useManualQuery<FetchOnUpdateData>(UPDATE_GQL);
	function fetchOnUpdate() {
		setBlurred(true);
		setIsLoading(true);
		setSearchString('');
		_fetchOnMount().then(res => {
			if (res && res.data) {
				if (res.data.queryCollections.aggregationsAsJson) {
					setLanguageOptions(res.data.queryCollections.aggregationsAsJson['language']['buckets'].map(({
						docCount,
						key
					}) => ({
						text: `${key} (${docCount})`,
						value: key
					})));
				}
				setQueryCollectionsGraph(res.data.queryCollections);
				setQueryCollectorsGraph(res.data.queryCollectors);
				setQueryFieldsGraph(res.data.queryFields);
				setJobsObjFromArr(res.data.listScheduledJobs);
				setDocumentTypes(res.data.queryDocumentTypes.hits);
				setTasks(res.data.queryTasks);
				setBlurred(false);
				setIsLoading(false);
			}
		});
	}

	const [ searchString, setSearchString ] = React.useState('');
	const [ _fetchCollections ] = useManualQuery<FetchCollectionsData>(COLLECTIONS_GQL_2.query);

	function fetchCollections() {
		setBlurred(true);
		setIsLoading(true);
		_fetchCollections({
			variables: {
				perPage: -1,
				query: `_name LIKE '*${searchString}*'`,
				// sort: '_name ASC'
			}
		}).then(res => {
			if (res && res.data && res.data.queryCollections) {
				setQueryCollectionsGraph(res.data.queryCollections);
			}
			setBlurred(false);
			setIsLoading(false);
		});
	}

	const [ fetchTasks ] = useManualQuery<FetchTasksData>(GQL_QUERY_QUERY_TASKS.query);
	const [pollTasks, setPollTasks] = React.useState(false);
	const pollTasksWhileActive = () => {
		// NOTE: We're not applying blurring here :)
		setIsLoading(true);
		fetchTasks().then(res => {
			if (res && res.data && res.data.queryTasks) {
				setTasks(res.data.queryTasks);
				setPollTasks(res.data.queryTasks.some(({
					name: taskDescriptor,
					state: taskState
				}) => {
					if (
						['WAITING', 'RUNNING'].includes(taskState)
						// NOTE: Assuming the rest are collector tasks
						&& taskDescriptor !== `com.enonic.app.explorer${COLON_SIGN}reindexCollection`
					) {
						return true;
					}
				}));
			}
			setBlurred(false); // NOTE: In case multiple fetches are active.
			setIsLoading(false);
		});
	};
	useInterval(() => {
		if (pollTasks) {
			pollTasksWhileActive();
		}
	}, 1000);

	useWhenInitAsync(() => fetchOnMount());

	const shemaIdToName = {};
	documentTypes.forEach(({_id, _name}) => {
		shemaIdToName[_id] = _name;
	});

	//──────────────────────────────────────────────────────────────────────────
	// Update effects (changes not init)
	//──────────────────────────────────────────────────────────────────────────
	useUpdateEffect(() => {
		const {hits} = queryCollectorsGraph;
		const newCollectors = {};
		for (let i = 0; i < hits.length; i++) {
			const {
				appName,
				displayName,
				taskName
			} = hits[i];
			newCollectors[`${appName}:${taskName}`] = displayName;
		}
		setCollectorIdToDisplayName(newCollectors);
	}, [
		queryCollectorsGraph
	])

	return {
		anyReindexTaskWithoutCollectionId,
		anyTaskWithoutCollectionName,
		collectionsTaskState,
		collectorIdToDisplayName, // setCollectorIdToDisplayName,
		collectorOptions,
		column,
		contentTypeOptions,
		copyModalCollectionId, setCopyModalCollectionId,
		deleteCollectionModalState, setDeleteCollectionModalState,
		direction,
		fieldsObj,
		intInitializedCollectorComponents,
		isBlurred,
		isLoading,
		jobsObj,
		locales,
		fetchOnUpdate,
		objCollectionsBeingReindexed,
		pollTasksWhileActive,
		queryCollectionsGraph,
		shemaIdToName,
		searchString, setSearchString, fetchCollections,
		setShowCollector,
		setShowDelete,
		setShowDocumentType,
		setShowInterfaces,
		setShowLanguage,
		setShowSchedule,
		showCollector,
		showDelete,
		showDocumentCount,
		showDocumentType,
		showInterfaces,
		showLanguage,
		showSchedule,
		siteOptions
	};
}

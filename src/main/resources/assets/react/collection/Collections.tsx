import type {
	CollectorComponents,
	SetLicensedToFunction,
	SetLicenseValidFunction
} from '../index.d';


import {
	TASK_STATE_FAILED,
	//TASK_STATE_FINISHED,
	TASK_STATE_RUNNING,
	TASK_STATE_WAITING,
	lpad,
	rpad
} from '@enonic/js-utils';

import {parseExpression as parseCronExpression} from 'cron-parser';
//import * as React from 'react';
import {
	Button, Dimmer, Header, Icon, Loader, Popup, Progress, Radio,
	Segment, Table
} from 'semantic-ui-react';
import {
	MONTH_TO_HUMAN
} from './SchedulingSegment';
import {DeleteCollectionModal} from './DeleteCollectionModal';
import {NewOrEditCollectionModal} from './NewOrEditCollectionModal';
import {useCollectionsState} from './useCollectionsState';
import {Cron} from '../utils/Cron';


const GQL_MUTATION_COLLECTIONS_REINDEX = `mutation ReindexMutation(
  $collectionIds: [String]!
) {
  reindexCollections(collectionIds: $collectionIds) {
    collectionId
    collectionName
    message
    documentTypeId
    taskId
  }
}`;


export function Collections(props :{
	collectorComponents :CollectorComponents
	licenseValid :boolean
	servicesBaseUrl :string
	setLicensedTo :SetLicensedToFunction
	setLicenseValid :SetLicenseValidFunction
}) {
	const {
		collectorComponents,
		licenseValid,
		servicesBaseUrl,
		setLicensedTo,
		setLicenseValid
	} = props;

	const {
		anyReindexTaskWithoutCollectionId,
		anyTaskWithoutCollectionName,
		collectionsTaskState,
		collectorOptions,
		column,
		contentTypeOptions,
		direction,
		fieldsObj,
		intInitializedCollectorComponents,
		isLoading,
		jobsObj,
		locales,
		memoizedFetchCollections,
		memoizedFetchOnUpdate,
		memoizedFetchTasks,
		objCollectionsBeingReindexed,
		queryCollectionsGraph,
		shemaIdToName,
		setBoolPoll,
		setShowCollector,
		setShowDelete,
		setShowDocumentType,
		//setShowInterfaces,
		setShowLanguage,
		setShowSchedule,
		showCollector,
		showDelete,
		showDocumentCount,
		showDocumentType,
		//showInterfaces,
		showLanguage,
		showSchedule,
		siteOptions
	} = useCollectionsState({
		collectorComponents,
		servicesBaseUrl
	});

	return <>
		<Segment basic style={{
			marginLeft: -14,
			marginTop: -14,
			marginRight: -14
		}}>
			<Table basic collapsing compact>
				<Table.Body>
					<Table.Row verticalAlign='middle'>
						<Table.Cell collapsing>
							<Radio
								label={"Show all fields"}
								checked={showCollector}
								onChange={(
									//@ts-ignore
									event :unknown,
									{checked}
								) => {
									setShowCollector(checked);
									// setShowDocumentCount(checked);
									setShowLanguage(checked);
									setShowDocumentType(checked);
									//setShowInterfaces(checked);
									setShowSchedule(checked);
									setShowDelete(checked);
								}}
								toggle
							/>
						</Table.Cell>
					</Table.Row>
				</Table.Body>
			</Table>
		</Segment>
		<Header as='h1'>Collections</Header>
		<Dimmer.Dimmable dimmed={isLoading}>
			<Dimmer active={isLoading}><Loader size='massive'>Loading</Loader></Dimmer>
			<Table celled collapsing compact selectable sortable striped>
				<Table.Header>
					<Table.Row>
						{/* Width is X columns of total 16 */}
						<Table.HeaderCell>Edit</Table.HeaderCell>
						<Table.HeaderCell
							onClick={null/*handleSortGenerator('displayName')*/}
							sorted={column === '_name' ? direction : null}
						>Name</Table.HeaderCell>
						{showCollector ? <Table.HeaderCell>Collector</Table.HeaderCell> : null}
						{showDocumentCount ? <Table.HeaderCell>Documents</Table.HeaderCell> : null}
						{showLanguage ? <Table.HeaderCell>Language</Table.HeaderCell> : null}
						{showDocumentType ? <Table.HeaderCell>Document Type</Table.HeaderCell> : null}
						{/*showInterfaces ? <Table.HeaderCell>Interfaces</Table.HeaderCell> : null*/}
						{showSchedule ? <Table.HeaderCell>Schedule</Table.HeaderCell> : null }
						<Table.HeaderCell>Actions</Table.HeaderCell>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{queryCollectionsGraph.hits && queryCollectionsGraph.hits.map(({
						_id: collectionId,
						_name,
						_path,
						collector,
						documentCount,
						//interfaces,
						language = '',
						documentTypeId = ''
					}, index) => {
						const key = `collection[${index}]`;

						const boolCollectorSelected = !!(collector && collector.name);
						//console.debug('boolCollectorSelected', boolCollectorSelected);

						const boolCollectorSelectedAndInitialized = !!(boolCollectorSelected && collectorComponents[collector.name]);
						//console.debug('boolCollectorSelectedAndInitialized', boolCollectorSelectedAndInitialized);

						const busy = anyReindexTaskWithoutCollectionId
						|| !!(
							objCollectionsBeingReindexed[collectionId]
							&& [TASK_STATE_RUNNING, TASK_STATE_WAITING].includes(objCollectionsBeingReindexed[collectionId].state)
						);
						//console.debug('busy', busy);

						const editEnabled = intInitializedCollectorComponents
							&& (boolCollectorSelectedAndInitialized || !boolCollectorSelected)
							&& !busy;
						//console.debug('editEnabled', editEnabled);

						const disabled = !editEnabled;
						//console.debug('disabled', disabled);

						const cron = jobsObj[collectionId]
							? jobsObj[collectionId].map(({value}) => {
								return new Cron(value).toObj();
							})
							: [new Cron('0 0 * * 0').toObj()]; // Default once a week
						const doCollect = jobsObj[collectionId] ? jobsObj[collectionId][0].enabled : false;
						return <Table.Row key={key}>
							<Table.Cell collapsing><NewOrEditCollectionModal
								collections={queryCollectionsGraph.hits}
								collectorOptions={collectorOptions}
								collectorComponents={collectorComponents}
								contentTypeOptions={contentTypeOptions}
								disabled={disabled}
								initialValues={{
									_id: collectionId,
									_name,
									_path,
									collector,
									cron,
									doCollect,
									documentTypeId,
									language
								}}
								fields={fieldsObj}
								locales={locales}
								licenseValid={licenseValid}
								_name={_name}
								afterClose={() => {
									//console.debug('NewOrEditCollectionModal afterClose');
									memoizedFetchOnUpdate();
									setBoolPoll(true);
								}}
								beforeOpen={() => {
									//console.debug('NewOrEditCollectionModal beforeOpen');
									setBoolPoll(false);
								}}
								servicesBaseUrl={servicesBaseUrl}
								setLicensedTo={setLicensedTo}
								setLicenseValid={setLicenseValid}
								siteOptions={siteOptions}
								totalNumberOfCollections={queryCollectionsGraph.total}
							/></Table.Cell>
							<Table.Cell collapsing>{_name}</Table.Cell>
							{busy
								? <Table.Cell collapsing colspan={
									(showCollector ? 1 : 0)
									+ (showDocumentCount ? 1 : 0)
									+ (showLanguage ? 1 : 0)
									+ (showDocumentType ? 1 : 0)
									+ (showInterfaces ? 1 : 0)
									+ (showSchedule ? 1 : 0)
								}><Progress
										active
										progress='ratio'
										total={objCollectionsBeingReindexed[collectionId].total}
										value={objCollectionsBeingReindexed[collectionId].current}
									/>{'Reindexing...'}</Table.Cell>
								: <>
									{showCollector ? <Table.Cell collapsing>{collector && collector.name || ''}</Table.Cell> : null}
									{showDocumentCount ? <Table.Cell collapsing>{documentCount}</Table.Cell> : null}
									{showLanguage ? <Table.Cell collapsing>{language}</Table.Cell> : null}
									{showDocumentType ? <Table.Cell collapsing>{shemaIdToName[documentTypeId]}</Table.Cell> : null }
									{/*showInterfaces ? <Table.Cell collapsing>{interfaces.map((iface, i :number) => <p key={i}>
										{i === 0 ? null : <br/>}
										<span style={{whiteSpace: 'nowrap'}}>{iface}</span>
									</p>)}</Table.Cell> : null*/}
									{showSchedule ? <Table.Cell>{
										jobsObj[collectionId]
											? jobsObj[collectionId].map(({enabled, value}, i :number) => {
												const interval = parseCronExpression(value);
												const fields = JSON.parse(JSON.stringify(interval.fields)); // Fields is immutable
												return <pre key={`${_name}.cron.${i}`} style={{color:enabled ? 'auto' : 'gray'}}>
													{`${Cron.hourToHuman(fields.hour)}:${
														Cron.minuteToHuman(fields.minute)} ${
														Cron.dayOfWeekToHuman(fields.dayOfWeek)} in ${
														rpad(MONTH_TO_HUMAN[fields.month.length === 12 ? '*' : fields.month[0]], 11)} (dayOfMonth:${
														lpad(fields.dayOfMonth.length === 31 ? '*' : fields.dayOfMonth)})`}
												</pre>;
											})
											: 'Not scheduled'
									}</Table.Cell> : null}
								</>
							}

							<Table.Cell collapsing>
								<Button.Group>
									{collector && collector.name
										? collectionsTaskState[_name]
											? {
												WAITING: <Popup
													content={`Collector is in waiting state`}
													inverted
													trigger={<Button disabled={!boolCollectorSelectedAndInitialized} icon><Icon color='yellow' name='pause'/></Button>}/>,
												RUNNING: <Popup
													content={`Stop collecting to ${_name}`}
													inverted
													trigger={<Button disabled={!boolCollectorSelectedAndInitialized} icon onClick={() => {
														fetch(`${servicesBaseUrl}/collectorStop?collectionName=${_name}`, {
															method: 'POST'
														}).then(() => {
															memoizedFetchTasks();
														});
													}}><Icon color='red' name='stop'/></Button>}/>,
												FINISHED: <Popup
													content={`Finished collecting to ${_name}`}
													inverted
													trigger={<Button disabled={!boolCollectorSelectedAndInitialized} icon><Icon color='green' name='checkmark'/></Button>}/>,
												FAILED: <Popup
													content={`Something went wrong while collecting to ${_name}`}
													inverted
													trigger={<Button disabled={!boolCollectorSelectedAndInitialized} icon><Icon color='red' name='warning'/></Button>}/>
											}[collectionsTaskState[_name]]
											: anyTaskWithoutCollectionName
												? <Popup
													content={`Some collector task is starting...`}
													inverted
													trigger={<Button disabled={!boolCollectorSelectedAndInitialized} icon loading><Icon color='yellow' name='question'/></Button>}/>
												: <Popup
													content={`Start collecting to ${_name}`}
													inverted
													trigger={<Button disabled={!boolCollectorSelectedAndInitialized || busy} icon onClick={() => {
														fetch(`${servicesBaseUrl}/collectionCollect?id=${collectionId}&name=${_name}`, {
															method: 'POST'
														}).then(() => {
															memoizedFetchTasks();
														});
													}}><Icon color={boolCollectorSelectedAndInitialized ? 'green' : 'grey'} name='cloud download'/></Button>}/>
										: <Button disabled={true} icon><Icon color='grey' name='cloud download'/></Button>
									}
									{anyReindexTaskWithoutCollectionId
										? <Popup
											content={`Some reindex task is starting...`}
											inverted
											trigger={<Button disabled={true} icon loading><Icon color='yellow' name='question'/></Button>}/>
										: <Popup
											content={
												objCollectionsBeingReindexed[collectionId]
												&& [TASK_STATE_RUNNING, TASK_STATE_WAITING].includes(objCollectionsBeingReindexed[collectionId].state)
													? `Collection is being reindexed...`
													: 'Start reindex'
											}
											inverted
											trigger={<Button
												disabled={
													objCollectionsBeingReindexed[collectionId]
													&& [TASK_STATE_RUNNING, TASK_STATE_WAITING].includes(objCollectionsBeingReindexed[collectionId].state) }
												icon
												onClick={() => {
													fetch(`${servicesBaseUrl}/graphQL`, {
														method: 'POST',
														headers: { 'Content-Type': 'application/json' },
														body: JSON.stringify({
															query: GQL_MUTATION_COLLECTIONS_REINDEX,
															variables: {
																collectionIds: [collectionId]
															}
														})
													})
														.then(res => res.json())
														.then(res => {
															console.debug(res);
														});
												}}
											>
												<Icon color={
													objCollectionsBeingReindexed[collectionId]
														? objCollectionsBeingReindexed[collectionId].state === TASK_STATE_FAILED
															? 'red'
															: [TASK_STATE_RUNNING, TASK_STATE_WAITING].includes(objCollectionsBeingReindexed[collectionId].state)
																? 'yellow'
																: 'green' // objCollectionsBeingReindexed[collectionId] === TASK_STATE_FINISHED
														: 'green'} name='recycle'/>
											</Button>}/>
									}
									<Popup
										content={`Duplicate collection ${_name}`}
										inverted
										trigger={<Button icon onClick={() => {
											fetch(`${servicesBaseUrl}/collectionDuplicate?name=${_name}`, {
												method: 'POST'
											}).then(() => {
												memoizedFetchCollections();
											});
										}}><Icon color='blue' name='copy'/></Button>}/>
									{showDelete ?<DeleteCollectionModal
										_name={_name}
										disabled={busy}
										afterClose={() => {
											//console.debug('DeleteCollectionModal afterClose');
											memoizedFetchCollections();
											setBoolPoll(true);
										}}
										beforeOpen={() => {
											//console.debug('DeleteCollectionModal beforeOpen');
											setBoolPoll(false);
										}}
										servicesBaseUrl={servicesBaseUrl}
									/> : null}
								</Button.Group>
							</Table.Cell>
						</Table.Row>;
					})}
				</Table.Body>
			</Table>
			<NewOrEditCollectionModal
				collections={queryCollectionsGraph.hits}
				collectorOptions={collectorOptions}
				collectorComponents={collectorComponents}
				contentTypeOptions={contentTypeOptions}
				disabled={!intInitializedCollectorComponents}
				fields={fieldsObj}
				licenseValid={licenseValid}
				locales={locales}
				afterClose={() => {
					//console.debug('NewOrEditCollectionModal afterClose');
					memoizedFetchOnUpdate();
					setBoolPoll(true);
				}}
				beforeOpen={() => {
					//console.debug('NewOrEditCollectionModal beforeOpen');
					setBoolPoll(false);
				}}
				servicesBaseUrl={servicesBaseUrl}
				setLicensedTo={setLicensedTo}
				setLicenseValid={setLicenseValid}
				siteOptions={siteOptions}
				totalNumberOfCollections={queryCollectionsGraph.total}
			/>
		</Dimmer.Dimmable>
	</>;
} // Collections

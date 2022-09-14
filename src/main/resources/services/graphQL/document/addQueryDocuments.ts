import type {
	QueryDSL
} from '@enonic/js-utils/src/types';
import type {
	BooleanFilter,
	Guillotine
} from '@enonic/js-utils/src/types/node/query/Filters.d';
import type {
	AnyObject
} from '/lib/explorer/types/index.d';


import {
	VALUE_TYPE_SET,
	addQueryFilter,
	camelize,
	isSet,
	toStr
} from '@enonic/js-utils';
import {getCollectionIds} from '/lib/explorer/collection/getCollectionIds';
import {
	COLLECTION_REPO_PREFIX,
	FIELD_PATH_GLOBAL,
	FIELD_PATH_META,
	PRINCIPAL_EXPLORER_READ
} from '/lib/explorer/constants';
import {queryDocumentTypes} from '/lib/explorer/documentType/queryDocumentTypes';
import {addFilterInput} from '/lib/explorer/interface/graphql/filters/guillotine/input/addFilterInput';
import {hasValue} from '/lib/explorer/query/hasValue';
import {connect} from '/lib/explorer/repo/connect';
import {multiConnect} from '/lib/explorer/repo/multiConnect';
import {
	GraphQLBoolean,
	GraphQLID,
	GraphQLInt,
	GraphQLString,
	Json as GraphQLJson,
	list,
	nonNull
	//@ts-ignore
} from '/lib/graphql';
import {
	//createAggregation,
	createFilters
	//@ts-ignore
} from '/lib/guillotine/util/factory';
import {
	GQL_ENUM_FIELD_KEYS_FOR_AGGREGATIONS,
	GQL_INPUT_TYPE_AGGREGATION,
	//GQL_INPUT_TYPE_AGGREGATION_COUNT,
	GQL_INPUT_TYPE_AGGREGATION_TERMS,
	GQL_INPUT_TYPE_QUERY_DSL_BOOLEAN_CLAUSE,
	GQL_QUERY_DOCUMENTS,
	GQL_TYPE_AGGREGATION_TERMS_BUCKET_NAME,
	GQL_TYPE_AGGREGATION_TERMS_NAME,
	GQL_TYPE_DOCUMENT_NAME,
	GQL_TYPE_DOCUMENT_QUERY_RESULT_FIELD_COUNT,
	GQL_TYPE_DOCUMENT_QUERY_RESULT_NAME
} from '../constants';


type AggregationArg = {
	name :string
	count ?:{
		fields :Array<string>
	}
	terms ?:{
		field :string
		order ?:string
		size ?:number
		minDocCount ?:number
	}
}

type AggregationRes = Record<string,{
	buckets :Array<{
		key :string
		docCount :number
	}>
}>

type QueryRes = {
	aggregations :Record<string,AggregationRes>
	count :number
	total :number
	hits :Array<{
		branch :string
		id :string
		repoId :string
		score :number
	}>
}


// Name must be non-null, non-empty and match [_A-Za-z][_0-9A-Za-z]*
const FIELD_NAME_TO_PATH = {
	collectionName: 'document_metadata.collection',
	// DEBUG
	//informationType: 'information-type',
	//language: 'language',
	//source: 'source'
};

const FIELD_VALUE_COUNT_AGGREGATION_PREFIX = '_count_Field_';

function aggregationsArgToQuery({
	aggregationsArg = []
} :{
	aggregationsArg ?:Array<AggregationArg>
}) {
	const obj = {};
	for (let i = 0; i < aggregationsArg.length; i++) {
	    const {
			name,
			/*count: {
				fields
			} = {},*/
			terms: {
				field,
				order,
				size,
				minDocCount
			} = {}
		} = aggregationsArg[i];
		if (field) {
			obj[name] = {
				terms: {
					field: FIELD_NAME_TO_PATH[field],
					order,
					size,
					minDocCount
				}
			};
		} /*else if (fields && fields.length) {
			obj[name] = {
				count: {
					field: fields[0]
				}
			};
		}*/
	} // for
	return obj;
} // aggregationsArgToQuery


function processAggregationsRes({
	aggregations = {},
	fieldNameToPath = {}
} :{
	aggregations ?:Record<string,AggregationRes>
	fieldNameToPath ?:Record<string,string>
}) {
	const list = [];
	const fieldValueCounts = [];
	const names = Object.keys(aggregations);
	for (let i = 0; i < names.length; i++) {
	    const name = names[i];
		const {buckets, value} = aggregations[name];
		if (buckets) {
			list.push({
				name,
				buckets
			});
		} else if (isSet(value)) {
			const camelizedFieldKey = name.replace(FIELD_VALUE_COUNT_AGGREGATION_PREFIX, '');
			if (camelizedFieldKey) {
				const fieldPath = fieldNameToPath[camelizedFieldKey];
				if (fieldPath) {
					fieldValueCounts.push({
						count: value,
						fieldPath
					});
				} else {
					log.error('Unable to find fieldPath from camelizedFieldKey:%s in fieldNameToPath:%s', camelizedFieldKey, toStr(fieldNameToPath));
				}
			} else {
				log.error('camelizedFieldKey became empty? name:%s', name);
			}
		}
	}
	return {
		aggregations: list,
		fieldValueCounts
	}
} // processAggregationsRes


export function addQueryDocuments({
	glue
}) {
	const filterInput = addFilterInput({glue});

	const queryDslBooleanClauseInput = glue.addInputType({
		name: GQL_INPUT_TYPE_QUERY_DSL_BOOLEAN_CLAUSE,
		fields: {
			term: {
				type: glue.addInputType({
					name: 'QueryDSLTermExpression',
					fields: {
						boost: {
							type: GraphQLInt
						},
						field: {
							type: nonNull(GraphQLString)
						},
						value: {
							type: GraphQLString // TODO
						}
					} // fields
				}) // QueryDSLTermExpression
			} // term
		} // fields
	})

	const queryInput = glue.addInputType({
		name: 'QueryDSL',
		fields: {
			boolean: {
				type: glue.addInputType({
					name: 'QueryDSLBoolean',
					fields: {
						must: {
							type: list(queryDslBooleanClauseInput)
						},
						mustNot: {
							type: list(queryDslBooleanClauseInput)
						},
						should: {
							type: list(queryDslBooleanClauseInput)
						}
					}
				})
			}
		}
	});

	glue.addEnumType({
		name: GQL_ENUM_FIELD_KEYS_FOR_AGGREGATIONS,
		values: Object.keys(FIELD_NAME_TO_PATH)
	});

	glue.addQuery({
		name: GQL_QUERY_DOCUMENTS,
		args: {
			aggregations: list(glue.addInputType({
				name: GQL_INPUT_TYPE_AGGREGATION,
				fields: {
					name: { type: nonNull(GraphQLString) },
					/*count: { type: glue.addInputType({
						name: GQL_INPUT_TYPE_AGGREGATION_COUNT,
						fields: {
							fields: {
								type: nonNull(list(glue.getEnumType(GQL_ENUM_FIELD_KEYS_FOR_AGGREGATIONS)))
							}
						}
					})},*/
					terms: { type: glue.addInputType({
						name: GQL_INPUT_TYPE_AGGREGATION_TERMS,
						fields: {
							field: {
								type: nonNull(glue.getEnumType(GQL_ENUM_FIELD_KEYS_FOR_AGGREGATIONS))
								//type: nonNull(GraphQLString) // DEBUG
							},
							order: {
								type: GraphQLString
							},
							size: {
								type: GraphQLInt
							},
							minDocCount: {
								type: GraphQLInt
							}
						}
					})},
				}
			})),
			collectionIds: list(GraphQLID),
			collections: list(GraphQLString),
			count: GraphQLInt,
			countFieldValues :GraphQLBoolean,
			filters: list(filterInput),
			query: queryInput,
			start: GraphQLInt
		},
		resolve(env :{
			args: {
				aggregations ?:Array<AggregationArg>
				count ?:number
				countFieldValues ?:boolean
				collectionIds ?:Array<string>
				collections ?:Array<string>
				filters ?:Guillotine.BooleanFilter
				query ?:QueryDSL|string
				start ?:number
			}
		}) {
			//log.debug('env:%s', toStr(env));

			const {
				args: {
					aggregations: aggregationsArg = [],
					collectionIds: collectionIdsArg = [],
					collections = [],
					count = 10,
					countFieldValues = false,
					filters: filtersArg,
					query,
					start = 0
				}
			} = env;
			//log.debug('aggregations:%s', toStr(aggregations));
			//log.debug('collections:%s', toStr(collections));
			//log.debug('filters:%s', toStr(filters));
			//log.debug('query:%s', toStr(query));

			const explorerRepoReadConnection = connect({
				principals: [PRINCIPAL_EXPLORER_READ]
			});

			// Get actual collections that exists
			const collectionIds = getCollectionIds({
				connection: explorerRepoReadConnection
			});
			//log.debug('collectionIds:%s', toStr(collectionIds));

			// 2 way lookup tables :)
			const collectionIdToName :Record<string,string> = {};
			const collectionNameToId :Record<string,string> = {};
			for (let i = 0; i < collectionIds.length; i++) {
			    const collectionId = collectionIds[i];
				const collectionNode = explorerRepoReadConnection.get(collectionId);
				if (collectionId && collectionNode._name) {
					collectionIdToName[collectionId] = collectionNode._name;
					collectionNameToId[collectionNode._name] = collectionId;
				}
			}
			//log.debug('collectionIdToName:%s', toStr(collectionIdToName));
			//log.debug('collectionNameToId:%s', toStr(collectionNameToId));

			const sources = [];
			//log.debug('collectionIdsArg:%s', toStr(collectionIdsArg));
			//log.debug('collections:%s', toStr(collections));
			if (collectionIdsArg && collectionIdsArg.length) {
				for (let i = 0; i < collectionIdsArg.length; i++) {
				    const collectionId = collectionIdsArg[i];
					if (collectionIdToName[collectionId]) {
						sources.push({
							repoId: `${COLLECTION_REPO_PREFIX}${collectionIdToName[collectionId]}`,
							branch: 'master', // NOTE Hardcoded
							principals: [PRINCIPAL_EXPLORER_READ]
						});
					} else {
						log.error(`Unable to find collectionName for collectionId:${collectionId} in collectionIdToName:${toStr(collectionIdToName)}!`);
					}
				}
			} else if (collections && collections.length) { // Filter against exisiting collections
				for (let i = 0; i < collections.length; i++) {
				    const collectionName = collections[i];
					//log.debug('i:%s collectionName:%s', i, toStr(collectionName));
					if (collectionNameToId[collectionName]) { // Only allow exisiting collections
						sources.push({
							repoId: `${COLLECTION_REPO_PREFIX}${collectionName}`,
							branch: 'master', // NOTE Hardcoded
							principals: [PRINCIPAL_EXPLORER_READ]
						});
					} else {
						log.error(`Unable to find collectionId for collectionName:${collectionName} in collectionNameToId:${toStr(collectionNameToId)}!`);
					}
				}
			} else {
				for (let i = 0; i < collectionIds.length; i++) {
				    const collectionId = collectionIds[i];
					if (collectionIdToName[collectionId]) {
						sources.push({
							repoId: `${COLLECTION_REPO_PREFIX}${collectionIdToName[collectionId]}`,
							branch: 'master', // NOTE Hardcoded
							principals: [PRINCIPAL_EXPLORER_READ]
						});
					} else {
						// Probably not possible, but whatever
						log.error(`Unable to find collectionName for collectionId:${collectionId} in collectionIdToName:${toStr(collectionIdToName)}!`);
					}
				}
			}
			//log.debug('sources:%s', toStr(sources));

			const documentTypes = queryDocumentTypes({
				readConnection: connect({ principals: [PRINCIPAL_EXPLORER_READ] })
			}).hits;
			//log.debug('documentTypes:%s', toStr(documentTypes));

			const fieldNameToPath = {
				//_allText: '_allText'
			};
			const aggregations = aggregationsArgToQuery({aggregationsArg});
			/*aggregations[`${FIELD_VALUE_COUNT_AGGREGATION_PREFIX}_allText`] = {
				count: {
					field: '_allText' // _alltext/_allText just returns 0
				}
			}*/
			for (let i = 0; i < documentTypes.length; i++) {
			    const {properties} = documentTypes[i];
				for (let j = 0; j < properties.length; j++) {
				    const {
						name,
						valueType
					} = properties[j];
					//log.debug('name:%s valueType:%s', name, valueType);
					if (valueType !== VALUE_TYPE_SET) {
						const camelizedFieldKey = camelize(name, /[.-]/g);
						if (fieldNameToPath[camelizedFieldKey]) {
							//log.debug(`name:${camelizedFieldKey} -> path:${name} already exist in fieldNameToPath`);
							if (fieldNameToPath[camelizedFieldKey] !== name) {
								log.error(`name:${camelizedFieldKey} newPath:${name} does not match oldPath:${fieldNameToPath[camelizedFieldKey]}!`);
							}
						} else {
							fieldNameToPath[camelizedFieldKey] = name;
							if (countFieldValues) {
								aggregations[`${FIELD_VALUE_COUNT_AGGREGATION_PREFIX}${camelizedFieldKey}`] = {
									count: {
										field: name
									}
								}
							}
						}
					} // !VALUE_TYPE_SET
				} // for properties
			} // for documentTypes
			//log.debug('fieldNameToPath:%s', toStr(fieldNameToPath));

			const multiConnectParams = {
				principals: [PRINCIPAL_EXPLORER_READ],
				sources
			};
			//log.debug('multiConnectParams:%s', toStr(multiConnectParams));
			const multiRepoReadConnection = multiConnect(multiConnectParams); // NOTE: This now protects against empty sources array.

			const staticFilters = addQueryFilter({ // Whitelist
				clause: 'must',
				filter: {
					exists: {
						field: 'document_metadata.collection'
					}
				},
				filters: addQueryFilter({ // Blacklist
					clause: 'mustNot',
					filter: hasValue('_nodeType', ['default'])
				})
			});

			let filtersArray :Array<AnyObject>;
			if (filtersArg) {
				// This works magically because fieldType is an Enum?
				filtersArray = createFilters(filtersArg);
				//log.debug('filtersArray:%s', toStr(filtersArray));
				filtersArray.push(staticFilters as unknown as AnyObject);
				//log.debug('filtersArray:%s', toStr(filtersArray));
			}

			const multiRepoQueryParams = {
				aggregations,
				count,
				filters: (filtersArray ? filtersArray : staticFilters) as BooleanFilter,
				query: query ? query : '',
				start
			};
			//log.debug('multiRepoQueryParams:%s', toStr(multiRepoQueryParams));

			const queryResult = multiRepoReadConnection.query(multiRepoQueryParams) as unknown as QueryRes;
			//log.debug('queryResult:%s', toStr(queryResult));
			//log.debug('queryResult.aggregations:%s', toStr(queryResult.aggregations));

			const {
				aggregations: list,
				fieldValueCounts
			} = processAggregationsRes({
				aggregations: queryResult.aggregations,
				fieldNameToPath
			});

			if (countFieldValues) {
				fieldValueCounts.push({
					count: queryResult.total,
					fieldPath: '_alltext'
				});
				fieldValueCounts.sort((a,b) => {
					// First by descending count
					if (a.count > b.count) {
						return -1;
					}
					if (a.count < b.count) {
						return 1;
					}
					// When count is equal, by ascending fieldPath
					if (a.fieldPath < b.fieldPath) {
						return -1;
					}
					if (a.fieldPath > b.fieldPath) {
						return 1;
					}
					// count and fieldPath are equal
					// This should never happen, indicates duplicate entries.
					return 0;
				}); // sort
			} // if countFieldValues

			return {
				aggregations: list,
				//aggregationsAsJson: JSON.stringify(queryResult.aggregations),
				count: queryResult.count,
				fieldValueCounts,
				total: queryResult.total,
				hits: queryResult.hits.map(({
					branch,
					id,
					repoId//,
					//score
				}) => {
					const singleRepoReadConnection = connect({
						branch,
						principals: [PRINCIPAL_EXPLORER_READ],
						repoId
					});
					const documentNode = singleRepoReadConnection.get(id);
					//log.debug('documentNode:%s', toStr(documentNode));

					const {
						_id,
						_name,
						_nodeType,
						_path,
						_versionKey,
						...rest
					} = documentNode;

					const obj = {};
					const keys = Object.keys(rest);
					for (let i = 0; i < keys.length; i++) {
					    const key = keys[i];
						if (
							!key.startsWith('_')
							&& !key.startsWith(FIELD_PATH_GLOBAL)
							&& !key.startsWith(FIELD_PATH_META)
						) {
							obj[key] = rest[key]
						}
					}
					//log.debug('obj:%s', toStr(obj));

					return {
						_id,
						_json: JSON.stringify(obj),
						_name,
						_nodeType,
						_path,
						_versionKey
					};
				}) // hits.map
			}; // return
		}, // resolve
		type: glue.addObjectType({
			name: GQL_TYPE_DOCUMENT_QUERY_RESULT_NAME,
			fields: {
				aggregations: { type: list(glue.addObjectType({
					name: GQL_TYPE_AGGREGATION_TERMS_NAME,
					fields: {
						name: { type: nonNull(GraphQLString) },
						buckets: { type: list(glue.addObjectType({
							name: GQL_TYPE_AGGREGATION_TERMS_BUCKET_NAME,
							fields: {
								docCount: { type: nonNull(GraphQLInt) },
								key: { type: nonNull(GraphQLString) }
							}
						}))},
					}
				}))},
				//aggregationsAsJson: { type: GraphQLJson },
				count: { type: nonNull(GraphQLInt) },
				fieldValueCounts: { type: list(glue.addObjectType({
					name: GQL_TYPE_DOCUMENT_QUERY_RESULT_FIELD_COUNT,
					fields: {
						count: { type: nonNull(GraphQLInt) },
						fieldPath: { type: nonNull(GraphQLString) }
					}
				}))},
				total: { type: nonNull(GraphQLInt) },
				hits: { type: list(glue.addObjectType({
					name: GQL_TYPE_DOCUMENT_NAME,
					fields: {
						_id: { type: glue.getScalarType('_id') },
						_json: { type: GraphQLJson },
						_name: { type: glue.getScalarType('_name') },
						_nodeType: { type: glue.getScalarType('_nodeType') },
						_path: { type: glue.getScalarType('_path') },
						_versionKey: { type: glue.getScalarType('_versionKey') }
					} // hit fields
				}))} // hits
			} // query result fields
		}) // type
	}); // glue.addQuery
} // addQueryDocuments

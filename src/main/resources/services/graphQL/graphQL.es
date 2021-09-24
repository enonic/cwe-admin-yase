//import {toStr} from '@enonic/js-utils';

import {
	execute,
	newSchemaGenerator
} from '/lib/graphql';

import {RT_JSON} from '/lib/explorer/model/2/constants';

import {getContentTypes} from './contentType';
import {getLicense} from './license';
import {getSites} from './site';
import {getLocales} from './i18n';
import {queryApiKeys} from './apiKey';

import {
	fieldCollectionCreate,
	fieldCollectionUpdate,
	fieldCollectionsQuery,
	fieldCollectionsReindex
} from './collection';

import {queryCollectors} from './collector';

import {
	fieldFieldCreate,
	fieldFieldDelete,
	fieldFieldsQuery,
	fieldFieldUpdate
} from './field';

import {generateFieldReferencedBy} from './generateFieldReferencedBy';

import {queryInterfaces} from './interface';
import {queryJournals} from './journal';

import {fieldScheduledJobsList} from './scheduler/fieldScheduledJobsList';

import {
	fieldDocumentTypeCreate,
	fieldDocumentTypeDelete,
	fieldDocumentTypeGet,
	fieldDocumentTypesQuery,
	fieldDocumentTypeUpdate
} from './documentType';

import {queryStopWords} from './stopWord';

import {
	fieldSynonymCreate,
	fieldSynonymDelete,
	fieldSynonymsQuery,
	fieldSynonymUpdate
} from './synonym';

import {
	fieldThesauriQuery,
	fieldThesaurusCreate,
	fieldThesaurusDelete,
	fieldThesaurusUpdate
} from './thesaurus';

import {
	fieldTaskQuery
} from './task';

const {
	createObjectType,
	createSchema
} = newSchemaGenerator();


export const SCHEMA = createSchema({
	mutation: createObjectType({
		name: 'Mutation',
		fields: {
			createCollection: fieldCollectionCreate,
			createDocumentType: fieldDocumentTypeCreate,
			createField: fieldFieldCreate,
			createSynonym: fieldSynonymCreate,
			createThesaurus: fieldThesaurusCreate,

			deleteDocumentType: fieldDocumentTypeDelete,
			deleteField: fieldFieldDelete,
			deleteSynonym: fieldSynonymDelete,
			deleteThesaurus: fieldThesaurusDelete,

			updateCollection: fieldCollectionUpdate,
			updateDocumentType: fieldDocumentTypeUpdate,
			updateField: fieldFieldUpdate,
			updateSynonym: fieldSynonymUpdate,
			updateThesaurus: fieldThesaurusUpdate,

			reindexCollections: fieldCollectionsReindex
		}
	}), // mutation
	query: createObjectType({
		name: 'Query',
		fields: {
			getContentTypes,
			getLicense,
			getLocales,
			getDocumentType: fieldDocumentTypeGet,
			getSites,
			listScheduledJobs: fieldScheduledJobsList,
			queryApiKeys,
			queryCollections: fieldCollectionsQuery,
			queryCollectors,
			queryFields: fieldFieldsQuery,
			queryInterfaces,
			queryJournals,
			queryStopWords,
			querySynonyms: fieldSynonymsQuery,
			queryDocumentTypes: fieldDocumentTypesQuery,
			queryThesauri: fieldThesauriQuery,
			queryTasks: fieldTaskQuery,
			referencedBy: generateFieldReferencedBy(createObjectType)
		} // fields
	}) // query
}); // SCHEMA


export function post(request) {
	//log.info(`request:${toStr(request)}`);

	const {body: bodyJson} = request;
	//log.info(`bodyJson:${toStr(bodyJson)}`);

	const body = JSON.parse(bodyJson);
	//log.info(`body:${toStr(body)}`);

	const {query, variables} = body;
	//log.info(`query:${toStr(query)}`);
	//log.info(`variables:${toStr(variables)}`);

	const context = {};
	//log.info(`context:${toStr(context)}`);

	return {
		contentType: RT_JSON,
		body: //JSON.stringify( // TODO This is causeing problems, commenting it out until I can look at all of them.
			// NOTE This add null values for missing properties,
			// but also causes default values in deconstruction to fail :(
			execute(SCHEMA, query, variables, context)
		//)
	};
} // post

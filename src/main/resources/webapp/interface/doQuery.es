import {PRINCIPAL_EXPLORER_READ} from '/lib/explorer/model/2/constants';
import {connect} from '/lib/explorer/repo/connect';

import {buildQueryParams} from './buildQueryParams';
import {connectToCollectionRepos} from './connectToCollectionRepos';
import {queryResAggregationsObjToArray} from './queryResAggregationsObjToArray';
import {washDocumentNode} from './washDocumentNode';


export function doQuery({
	camelToFieldObj,
	collections,
	collectionIdToDocumentTypeId,
	env,
	documentTypeIdToName,
	fields,
	stopWords
}) {
	const explorerRepoReadConnection = connect({ principals: [PRINCIPAL_EXPLORER_READ] });

	const [queryParams, types] = buildQueryParams({
		camelToFieldObj,
		env,
		explorerRepoReadConnection,
		fields,
		stopWords
	});
	//log.debug(`queryParams:${toStr({queryParams})}`);

	const repoIdObj = {};
	const multiRepoReadConnection = connectToCollectionRepos({
		collections,
		collectionIdToDocumentTypeId,
		documentTypeIdToName,
		repoIdObj // modified inside
	});

	const queryRes = multiRepoReadConnection.query(queryParams);
	//log.debug(`queryRes:${toStr(queryRes)}`);

	queryRes.aggregations = queryResAggregationsObjToArray({
		obj: queryRes.aggregations,
		types
	});
	//log.debug(`queryRes.aggregations:${toStr(queryRes.aggregations)}`);

	queryRes.aggregationsAsJson = JSON.stringify(queryRes.aggregations);

	queryRes.hits = queryRes.hits.map(({
		branch,
		highlight,
		id,
		repoId,
		score
	}) => {
		//log.debug(`highlight:${toStr(highlight)}`);

		const washedNode = washDocumentNode(connect({
			branch,
			principals: [PRINCIPAL_EXPLORER_READ],
			repoId
		}).get(id));
		//log.debug(`washedNode:${toStr(washedNode)}`);

		const json = JSON.stringify(washedNode);

		Object.keys(washedNode).forEach((k) => {
			// Cast to string?
			// Looks like GraphQL does it for me, however
			// 999999999999999.9 becomes "9.999999999999999E14"
			washedNode[`${k}_as_string`] = washedNode[k];
		});

		// NOTE By doing this the frontend developer can't get the full field value and highlight in the same query.
		// TODO We might NOT want to do that...
		const obj = {};
		if (highlight) {
			Object.keys(highlight).forEach((k) => {
				//log.debug(`k:${k} highlight[${k}]:${toStr(highlight[k])}`);
				//const first = forceArray(highlight[k])[0];
				if (k.includes('._stemmed_')) {
					// NOTE If multiple languages, the latter will overwrite the first. A single nodes with multiple lanugages is unsupported.
					const kWithoutStemmed = k.split('._stemmed_')[0];
					//log.debug(`k:${k} kWithoutStemmed:${kWithoutStemmed}`);
					obj[kWithoutStemmed] = highlight[k];
					washedNode[kWithoutStemmed] = highlight[k][0];
				} else {
					if(!obj[k]) { // From fulltext
						obj[k] = highlight[k];
						washedNode[k] = highlight[k][0];
					}
				}
			});
		} // if (highlight)

		//log.debug(`repoId:${repoId} repoIdObj[repoId]:${toStr(repoIdObj[repoId])}`);
		const {
			collectionId,
			collectionName,
			documentTypeId,
			documentTypeName
		} = repoIdObj[repoId];

		/* eslint-disable no-underscore-dangle */
		washedNode._collectionId = collectionId;
		washedNode._collectionName = collectionName;
		washedNode._documentTypeId = documentTypeId;
		washedNode._documentTypeName = documentTypeName; // NOTE This could be used in unionType typeresolver to determine documentType
		washedNode._highlight = obj;
		washedNode._json = json;
		washedNode._repoId = repoId; // Same info in _collection
		washedNode._score = score;
		/* eslint-enable no-underscore-dangle */
		return washedNode;
	}); // queryRes.hits.map
	//log.debug(`queryRes:${toStr(queryRes)}`);

	return queryRes;
}

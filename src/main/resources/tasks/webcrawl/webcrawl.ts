import type { Node } from '/lib/xp/node';
import type {
	AnyNode,
	Cheerio,
	SelectorType
} from 'cheerio';
import type { Response } from '@enonic-types/lib-explorer';
import type {
	WebCrawlConfig,
	WebCrawlDocument,
} from './webcrawl.d';


import 'core-js/stable/array/from';
import 'core-js/stable/object/assign';
import 'core-js/stable/string/includes';
import 'core-js/stable/string/from-code-point';
import 'core-js/stable/string/trim-end';
import 'core-js/stable/array/find';
import 'core-js/stable/array/find-index';
import 'core-js/stable/array/includes';

// TypeError: Object.getOwnPropertyDescriptors is not a function
// require('object.getownpropertydescriptors').shim(); // eslint-disable-line @typescript-eslint/no-var-requires
import getDescriptors = require('object.getownpropertydescriptors');
getDescriptors.shim();

import {forceArray} from '@enonic/js-utils/array/forceArray';
import {toStr} from '@enonic/js-utils/value/toStr';

// Cheerio import causes:
// TypeError: Cannot read property "TYPED_ARRAY_SUPPORT" from undefined
// And requires global to be provided by webpack.
import cheerio from 'cheerio'; // uses Array.from
// cheerio: str.trimEnd is not a function
// import cheerio from '/lib/cheerio';
import { ElementType } from "domelementtype";
// import pretty from 'pretty';

// import safeStringify from 'fast-safe-stringify';
// import {parseDOM} from 'htmlparser2';

// WARNING: Causes TypeError: Cannot read property "Symbol" from undefined in production mode!
// NOTE: Now that the server files are build using tsup, the error seems gone on my laptop.
import { // Runtime Errors with MAP and symbol?
	parse, resolve,
} from 'uri-js';

// @ts-ignore
import {request as httpClientRequest} from '/lib/http-client';

import {exists} from '/lib/explorer/node/exists';
import {get} from '/lib/explorer/node/get';
import {hash} from '/lib/explorer/string/hash';
import {Collector} from '/lib/explorer/collector/Collector';

import {DEFAULT_UA} from './constants';

import ContentTypeException from './exceptions/ContentTypeException';
import NotFoundException from './exceptions/NotFoundException';
import RobotsException from './exceptions/RobotsException';

import getRobotsTxt from './robots/getRobotsTxt';
import throwIfNotAllowed from './robots/throwIfNotAllowed';
import throwIfNotIndexable from './robots/throwIfNotIndexable';
import {throwIfExcluded} from './robots/throwIfExcluded';

import {matchesExcludeRegexp} from './uri/matchesExcludeRegexp';
import {normalizeUriObj} from './uri/normalizeUriObj';
import {normalizeWithoutEndingSlash} from './uri/normalizeWithoutEndingSlash';
import {pathFromResolvedUri} from './uri/pathFromResolvedUri';
import {serializeNormalizedUriObjWithQuery} from './uri/serializeNormalizedUriObjWithQuery';
import {canonizeNormalizedUriObj} from './uri/canonizeNormalizedUriObj';


const TRACE = false;


const querySelector = (
	node: Cheerio<AnyNode>,
	selector: SelectorType
) => cheerio(node.find(selector)[0]);


const querySelectorAll = (
	node: Cheerio<AnyNode>,
	selector: SelectorType
) => node.find(selector).toArray()
	.map((element) => cheerio(element));


const getAttributeValue = (
	node: Cheerio<AnyNode>,
	name: string
) => {
	const attributeValue = node.attr(name);

	if (typeof attributeValue === 'string') {
		return attributeValue;
	}

	// throw new Error(`Could not find a string value attribute:${name}!`);
	return undefined;
};

const remove = (
	node: Cheerio<AnyNode>,
	selector: SelectorType
) => {
	const elsToRemove = querySelectorAll(node, selector);
	elsToRemove.forEach((elToRemove) => {
		TRACE && log.debug('Removing outerHTML:%s', outerHTML(elToRemove));
		elToRemove.remove();
	});
}


const removeDisplayNoneAndVisibilityHidden = (
	node: Cheerio<AnyNode>
) => {
	const elsWithStyleAttribute = querySelectorAll(node, '[style]');
	for (let i = 0; i < elsWithStyleAttribute.length; i++) {
		const elWithStyleAttribute = elsWithStyleAttribute[i];
		TRACE && log.debug('Looking at outerHTML:%s', outerHTML(elWithStyleAttribute));

		// const styleValue = getAttributeValue(elWithStyleAttribute, 'style');
		// TRACE && log.debug('styleValue:%s', toStr(styleValue));

		const {
			display,
			visibility
		} = elWithStyleAttribute.css(['display', 'visibility']);

		// const display = elWithStyleAttribute.css('display');
		TRACE && log.debug('display:%s', toStr(display));

		// const visibility = elWithStyleAttribute.css('visibility');
		TRACE && log.debug('visibility:%s', toStr(visibility));

		if (
			display === 'none'
			|| visibility === 'hidden'
		) {
			TRACE && log.debug('Removing outerHTML:%s', outerHTML(elWithStyleAttribute));
			elWithStyleAttribute.remove();
		}
	}
}

const outerHTML = (node: Cheerio<AnyNode>) => node.clone().wrap('<div>').parent().html();

const REPLACEMENT = '&#129'; // HOP illegal in html :)
const REPLACE_ALL_REPLACEMENT_REGEXP = new RegExp(`${REPLACEMENT}+`, 'g');

function getText(node: Cheerio<AnyNode>) {
	// TRACE && log.debug('getText(%s)', node); // Error: JSON.stringify got a cyclic data structure

	// log.debug('.nodeType:%s', node['nodeType']); // undefined
	// log.debug('.type:%s', node['type']); // undefined

	let str = '';
	try {
		// https://cheerio.js.org/docs/api/classes/Cheerio#prop
		// Method for getting and setting properties.
		// Gets the property value for only the first element in the matched set.
		// "innerText" | "outerHTML" | "textContent" | "innerHTML"
		//
		// Note that while textContent gets the content of all elements, including <script> and <style> elements, innerText, doesn't.
		// innerText is also aware of style and will not return the text of hidden elements, whereas textContent will.
		// log.debug('textContent:%s', node.prop('textContent'));
		// log.debug('innerText:%s', node.prop('innerText')); // There doesn't seem to be differences in whitespace between textContent and innerText
		// return node.prop('innerText').replace(/(\r\n|\n|\r)/gm, ' '); // No whitespace between elements :(
		str = node.prop('innerHTML');
		// log.debug('innerHTML:%s', str);

		if (!str) {
			log.warning('getText innerHTML is empty!');
			return '';
		}

		// NOTE: node.html() can also trigger: Cannot read property "children" from undefined
		// node.html() might be the same as innerHTML or outerHTML ?
	} catch (e) {
		if (e.message !== 'Cannot read property "children" from undefined') {
			log.error(`node.prop('innerHTML'): Unknown error:${e.message}`, e);
		}
		str = node
			// https://cheerio.js.org/docs/api/classes/Cheerio#text
			// Get the combined text contents of each element in the set of matched elements, including their descendants.
			.text() // No whitespace bewteen elements :(
			.replace(/\s\s+/g, ' ') // This will replace newlines, tabs etc...;

		// https://cheerio.js.org/docs/api/classes/Cheerio#contents
		// Gets the children of each element in the set of matched elements, including text and comment nodes.
		//
		// NOTE: Perhaps a better fallback could be a combination of .contents and .prop('innerText')?
	}

	return str
		//.replaceAll(/<\/?[a-zA-Z0-9=" ]*>/g, ' ') // This doesn't handle <!-- --> and more
		// How to handle tags inside comments... <!-- <div></div> -->
		.replace(/<\/?[^>]+>/g, REPLACEMENT)
		//.replace(/\s\s+/g, ' ') // This will replace newlines, tabs etc...
		.replace(REPLACE_ALL_REPLACEMENT_REGEXP, ' ')
		.trim();
}

export function run({
	collectionId,
	collectorId,
	configJson,
	language
}) {
	// log.debug('webcrawl: collectionId:%s', collectionId);
	// log.debug('webcrawl: collectorId:%s', collectorId);
	// log.debug('webcrawl: configJson:%s', configJson);
	// log.debug('webcrawl: language:%s', language);

	const collector = new Collector<WebCrawlConfig>({
		collectionId,
		collectorId,
		configJson,
		language
	});
	if (!collector.config.baseUri) { throw new Error('Config is missing required parameter baseUri!'); }
	collector.start();

	let {
		baseUri,
		userAgent = DEFAULT_UA // Doesn't handle '' or null
	} = collector.config;

	if (!userAgent) {
		userAgent = DEFAULT_UA;
	}
	log.debug('userAgent:%s', userAgent);

	log.debug('app.config:%s', app.config);
	const {
		browserlessUrl
	} = app.config;
	TRACE && log.debug('browserlessUrl:%s', browserlessUrl);

	const {
		excludes = [],
		httpRequestHeaders = [],
		keepHtml = false,
		maxPages = 1000,
		resume = false,
	} = collector.config;
	TRACE && log.debug('keepHtml:%s', keepHtml);

	// NOTE: This forceArray is probably not needed, as configJson comes from collectorNode.collector.configJson
	const excludeRegExps = forceArray(excludes).map(str => new RegExp(str));

	if (!baseUri.includes('://')) { baseUri = `https://${baseUri}`;}
	const normalizedBaseUriObj = normalizeUriObj(baseUri); // Not using parse, because that doesn't covert "%7E" to "~", etc.
	const {host: domain, scheme} = normalizedBaseUriObj;
	log.debug('domain:%s', domain);
	log.debug('scheme:%s', scheme);

	// NOTE: Can't use serialize on normalizedBaseUriObj here, because that adds a trailing slash :(
	const normalizedentryPointUrl = normalizeWithoutEndingSlash(baseUri);
	log.debug('normalizedentryPointUrl:%s', normalizedentryPointUrl);

	const robots = getRobotsTxt(userAgent, scheme, domain); // object with functions
	TRACE && log.debug('robots:%s', toStr(robots));

	const seenUrisObj = {[normalizedentryPointUrl]: true};
	TRACE && log.debug('seenUrisObj:%s', toStr(seenUrisObj));

	const persistedCanonicalUrls = {};

	const queueArr = [normalizedentryPointUrl];
	TRACE && log.debug('queueArr:%s', toStr(queueArr));

	function handleNormalizedUri(normalized: string) {
		if (
			!seenUrisObj[normalized]
		) {
			seenUrisObj[normalized] = true;
			queueArr.push(normalized);
			collector.taskProgressObj.total += 1;
		}
	} // handleNormalizedUri

	let pageCounter = 0;
	whileQueueLoop:
	while(queueArr.length) {
		TRACE && log.debug('pageCounter:%s', toStr(pageCounter));
		if (pageCounter >= maxPages || collector.shouldStop()) {
			break whileQueueLoop;
		}
		pageCounter += 1;

		// Normalized before adding to queue, still contains query though, in case of pagination.
		const url = queueArr.shift();
		log.debug('url:%s', url);

		// NOTE: Not switching to normalizeUrlObj here, because that may break robots functionality.
		const baseUrlObj = parse(url);
		TRACE && log.debug('baseUrlObj:%s', toStr(baseUrlObj));

		try {
			collector.taskProgressObj.info.uri = url; // eslint-disable-line no-param-reassign
			if (resume) {
				collector.taskProgressObj.info.message = `Resuming ${url}`;
				collector.progress();
				collector.taskProgressObj.current += 1; // eslint-disable-line no-param-reassign
				const nodeName = hash(url);
				if (exists({
					connection: collector.collection.connection,
					_parentPath: '/',
					_name: nodeName
				})) {
					const node = get<WebCrawlDocument>({
						connection: collector.collection.connection,
						_name: nodeName
					});
					const {
						links = [] // Can be undefined
					} = node as Node<WebCrawlDocument>;
					forceArray(links).forEach(normalized => handleNormalizedUri(
						normalizeWithoutEndingSlash(normalized) // Can't assume that historic data contains normalized urls
					));
				} // exists
			} else { // !resume
				collector.taskProgressObj.info.message = `Processing ${url}`;
				collector.progress();
				collector.taskProgressObj.current += 1; // eslint-disable-line no-param-reassign
				throwIfNotAllowed({
					robots,
					path: baseUrlObj.path,
					userAgent
				});
				const urlWithoutSchemeAndDomain = url
					.replace(/^.*?:\/\//, '') // scheme http://
					.replace(/^.*?\//, '/') // domain www.enonic.com
				TRACE && log.debug('urlWithoutSchemeAndDomain:%s', urlWithoutSchemeAndDomain);
				throwIfExcluded({ excludeRegExps, urlWithoutSchemeAndDomain });
				const headers = { // HTTP/2 uses lowercase header keys
					'user-agent': userAgent
				};
				httpRequestHeaders.forEach(({name, value}) => {
					headers[name.toLowerCase()] = value;
				});
				TRACE && log.debug('headers:%s', toStr(headers));

				const headersWithoutUserAgent = {...headers};
				delete headersWithoutUserAgent['user-agent'];

				const requestParams = browserlessUrl ? {
					// NOTE: https://chrome.browserless.io/docs/#/Browser%20API/post_content
					body: JSON.stringify({
						// The user-agent that Browserless uses when requesting the internet is:
						// 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/119.0.0.0 Safari/537.36'
						// Overriding it:
						userAgent,
						url
					}),
					contentType: 'application/json',
					followRedirects: true,
					headers: headersWithoutUserAgent,
					method: 'POST',
					url: browserlessUrl
				} : {
					followRedirects: true, // https://www.enonic.com uses 302
					headers,
					url
				};
				log.debug('requestParams:%s', toStr(requestParams));

				const res: Response = httpClientRequest(requestParams);
				TRACE && log.debug('res:%s', toStr(res));

				if (res.status === 404) {
					throw new NotFoundException(url);
				}

				if (res.status != 200) {
					throw new Error(`Status: ${res.status}!`);
				}

				if (!res.contentType.includes('html')) {
					throw new ContentTypeException(url, `ContentType:${res.contentType} does not include html!`);
				}

				// X-Robots-Tag HTTP header http://www.searchtools.com/robots/x-robots-tag.html
				// log.debug(toStr({headers: res.headers}));
				let boolFollow = true;
				let boolIndex = true;
				if (res.headers['X-Robots-Tag']) {
					const xRobotsTag = res.headers['X-Robots-Tag'].toUpperCase();
					if (xRobotsTag.includes('NOFOLLOW')) {
						boolFollow = false;
					}
					if (xRobotsTag.includes('NOINDEX')) {
						if(!boolFollow) {
							throw new RobotsException(url, `HTTP header X-Robots-Tag:${res.headers['X-Robots-Tag']} includes both NOFOLLOW and NOINDEX`);
						}
						boolIndex = false;
					}
				}
				// log.debug(toStr({boolFollow, boolIndex}));

				// const dom = parseDOM(res.body, options);
				const rootNode = cheerio.load(res.body, {
					// decodeEntities: true, // If set to true, entities within the document will be decoded. Defaults to true.
					// lowerCaseAttributeNames: false,// If set to true, all attribute names will be lowercased. This has noticeable impact on speed, so it defaults to false.
					lowerCaseTags: true, // If set to true, all tags will be lowercased. If xmlMode is disabled, this defaults to true.
					// normalizeWhitespace: true, // Removes NEWLINES, but there are still multiple spaces
					// scriptingEnabled: false, // Disable scripting in parse5, so noscript tags would be parsed.
					xmlMode: false // Tags are lowercased // When xmlMode is false noscript tags are in the dom, but it's content doesn't show up in querySelector!
					// xmlMode: true // Avoid stripping noscript tags?
				}).root(); // log.debug(safeStringify({rootNode})); // Huuuuuuuge!!!
				// log.debug(safeStringify({html: rootNode.html()}));

				const headEl = querySelector(rootNode, 'head');
				log.debug('headEl:%s', getText(headEl));
				// log.debug(safeStringify({head: head.html()}));

				// Robots <META> tag http://www.searchtools.com/robots/robots-meta.html
				const robotsMetaEl = querySelector(headEl, 'meta[name=robots]');
				if (robotsMetaEl) {
					const robotsMetaHtml = outerHTML(robotsMetaEl);
					// log.debug(toStr({robotsMetaHtml}));
					const robotsMetaContentAttr = getAttributeValue(robotsMetaEl, 'content');
					if (robotsMetaContentAttr) {
						const robotsMetaUc = robotsMetaContentAttr.toUpperCase();
						if (robotsMetaUc.includes('NOFOLLOW')) {
							boolFollow = false;
							if (robotsMetaUc.includes('NOINDEX')) {
								throw new RobotsException(url, `Found both NOFOLLOW and NOINDEX in ${robotsMetaHtml}`);
							}
						}
						if (robotsMetaUc.includes('NOINDEX')) {
							boolIndex = false;
						}
						if(!boolFollow && !boolIndex) {
							throw new RobotsException(url, `Found both NOFOLLOW and NOINDEX combined from HTTP header X-Robots-Tag:${res.headers['X-Robots-Tag']} and ${robotsMetaHtml}`);
						}
					}
				}
				log.debug(`boolFollow:${toStr(boolFollow)}`);
				log.debug(`boolIndex:${toStr(boolIndex)}`);

				const htmlWithLangEl = querySelector(rootNode,'html[lang]');

				const lang = htmlWithLangEl ? getAttributeValue(htmlWithLangEl, 'lang') : '';
				log.debug('lang:%s', lang);

				const titleEl = querySelector(headEl, 'title');
				log.debug('titleEl:%s', outerHTML(titleEl));

				const title = titleEl ? getText(titleEl) : '';
				log.debug('title:%s', title);

				const ogTitleEl = querySelector(headEl, "meta[property='og:title'][content]");
				const ogTitle = ogTitleEl ? getAttributeValue(ogTitleEl, 'content') : '';
				TRACE && log.debug('ogTitle:%s', ogTitle);

				const ogDescriptionEl = querySelector(headEl, "meta[property='og:description'][content]");
				const ogDescription = ogDescriptionEl ? getAttributeValue(ogDescriptionEl, 'content') : '';
				TRACE && log.debug('ogDescription:%s', ogDescription);

				const ogSiteNameEl = querySelector(headEl, "meta[property='og:site_name'][content]");
				const ogSiteName = ogSiteNameEl ? getAttributeValue(ogSiteNameEl, 'content') : '';
				TRACE && log.debug('ogSiteName:%s', ogSiteName);

				const ogLocaleEl = querySelector(headEl, "meta[property='og:locale'][content]");
				const ogLocale = ogLocaleEl ? getAttributeValue(ogLocaleEl, 'content') : '';
				TRACE && log.debug('ogLocale:%s', ogLocale);

				const bodyElWithNothingRemoved = querySelector(rootNode, 'body');
				//log.debug('bodyElWithNothingRemoved:%s', getText(bodyElWithNothingRemoved));

				const cleanedBodyEl = bodyElWithNothingRemoved.clone();
				//log.debug('cleanedBodyEl:%s', getText(cleanedBodyEl));

				// Remove all elements except tags and text
				cleanedBodyEl.find('*').contents().filter(
					(_i, el) => !(
						el.type === ElementType.Tag
						|| el.type === ElementType.Text
					)
				).remove();

				remove(cleanedBodyEl, 'aside');
				remove(cleanedBodyEl, 'footer');
				remove(cleanedBodyEl, 'noscript'); // This works
				remove(cleanedBodyEl, 'nav');
				remove(cleanedBodyEl, 'script');

				// It seems Cheerio doesn't support *= selectors
				// remove(cleanedBodyEl, '[style*="display:none"]');
				// remove(cleanedBodyEl, '[style*="display: none"]');
				// remove(cleanedBodyEl, '[style*="visibility:hidden"]');
				// remove(cleanedBodyEl, '[style*="visibility: hidden"]');
				removeDisplayNoneAndVisibilityHidden(cleanedBodyEl);
				// throw new Error('DEBUG');

				remove(cleanedBodyEl, '[aria-hidden=true]');
				remove(cleanedBodyEl, '[hidden]');

				// https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag#data-nosnippet-attr
				remove(cleanedBodyEl, '[data-noindex]');

				// log.debug(`cleanedBodyEl:${toStr(cleanedBodyEl)}`); // JSON.stringify got a cyclic data structure
				// log.debug(safeStringify({body: body.html()}));

				const links: string[] = [];
				if (boolFollow) {
					const linkEls = querySelectorAll(bodyElWithNothingRemoved, "a[href]:not([href^='#']):not([href^='mailto:']):not([href^='tel:']):not([href^='content:'])");
					log.debug('linkEls.length:%s', linkEls.length);
					const linksInCleanedBody = querySelectorAll(cleanedBodyEl, "a[href]:not([href^='#']):not([href^='mailto:']):not([href^='tel:']):not([href^='content:'])");
					log.debug('linksInCleanedBody.length:%s', linksInCleanedBody.length);
					linksForLoop:
					for (let i = 0; i < linkEls.length; i += 1) {
						const el = linkEls[i];
						// log.debug(`el:${safeStringify(el)}`); // JSON.stringify got a cyclic data structure
						const rel = getAttributeValue(el, 'rel');
						// https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links#nofollow
						if (rel && rel.toUpperCase().includes('NOFOLLOW')) {
							continue linksForLoop;
						}
						const href = getAttributeValue(el, 'href'); // javascript:void(0)
						log.debug('href:%s', href);

						try {
							if (href.startsWith('javascript:')) {
								continue linksForLoop;
							}

							const resolved = resolve(url, href);
							log.debug('resolved:%s', resolved);

							const normalizedUriObj = normalizeUriObj(resolved);
							log.debug('uriObj:%s', normalizedUriObj);

							const currentHost = normalizedUriObj.host;
							log.debug('currentHost:%s', currentHost);

							if (currentHost !== domain) {
								continue linksForLoop;
							}

							if (matchesExcludeRegexp({
								excludeRegExps,
								urlWithoutSchemeAndDomain: pathFromResolvedUri(resolved)
							})) {
								continue linksForLoop;
							}

							const normalized = serializeNormalizedUriObjWithQuery(normalizedUriObj);
							log.debug('normalized:%s', normalized);

							if (!links.includes(normalized)) {
								links.push(normalized);
							}

							handleNormalizedUri(normalized);

						} catch (e) {
							// Just log and ignore links that we don't support
							log.error(`${url}: Something went wrong while processing a[href]:${href} ${e.message}`, e);
						} // try/catch
					} // for linkEls
				} // boolFollow

				const canonizedUrl = canonizeNormalizedUriObj(normalizeUriObj(url));
				TRACE && log.debug('canonizedUrl:%s', canonizedUrl);

				if (persistedCanonicalUrls[canonizedUrl]) {
					if (url !== canonizedUrl) {
						log.info(`Skipping already persisted variant:${url} of canonizedUrl:${canonizedUrl}`);
					} else {
						log.info(`Skipping already persisted canonizedUrl:${canonizedUrl}`);
					}
					boolIndex = false;
				}

				if (boolIndex) {
					throwIfNotIndexable({
						path: baseUrlObj.path,
						robots,
						userAgent
					});

					const { path } = baseUrlObj; // TODO WARNING baseUrlObj is not normalized.
					TRACE && log.debug('path:%s', path);

					const text = getText(cleanedBodyEl);
					TRACE && log.debug('text:%s', text);

					const documentToPersist: WebCrawlDocument = {
						displayname: ogTitle || title, // This has no field definition by default
						domain,
						og_description: ogDescription,
						og_locale: ogLocale,
						og_site_name: ogSiteName,
						og_title: ogTitle,
						links,
						path: path || '/', // TODO WARNING: This path is currently not normalized!
						text,
						title,
						url: canonizedUrl,
					};

					if (keepHtml) {
						documentToPersist.html = res.body;
					}
					TRACE && log.debug('documentToPersist:%s', toStr(documentToPersist));

					// Check if any document with url exists
					const queryDocumentsParams = {
						aggregations: null,
						count: -1,
						filters: null,
						query: {
							boolean: {
								must: {
									term: {
										field: 'url',
										value: canonizedUrl
									}
								}
							}
						},
						sort: null,
						start: null
					};
					const documentsRes = collector.queryDocuments(queryDocumentsParams);
					// log.debug('webcrawl documentsRes:%s', toStr(documentsRes));
					// log.error('webcrawl queryDocumentsParams:%s documentsRes:%s', queryDocumentsParams, documentsRes);

					if (documentsRes.total > 1) {
						for (let i = 0; i < documentsRes.hits.length; i++) {
							const {id} = documentsRes.hits[i]
							const {url: anUrl} = collector.getDocumentNode(id);
							if (anUrl === canonizedUrl) { // Direct case sensitive match
								documentToPersist._id = documentsRes.hits[0].id;
							}
						}
						if (!documentToPersist._id) { // This means create rather than update
							log.debug(`Unable to find a case sensitive match for url among documents with ids:${
								toStr(documentsRes.hits.map(({id}) => id))
							}`);
						}
					} else if (documentsRes.total === 1) {
						// Provide which document node to update (rather than creating a new document node)
						documentToPersist._id = documentsRes.hits[0].id;
					}

					// log.error('documentToPersist:%s', documentToPersist);
					const persistedDocument = collector.persistDocument(
						documentToPersist,
						{
							// Must be identical to a _name in src/main/resources/documentTypes.json
							documentTypeName: 'webpage',
							language: lang || ogLocale
						}
					);
					log.debug('persistedDocument:%s', toStr(persistedDocument));

					persistedCanonicalUrls[canonizedUrl] = true;
				} // indexable
			} // resume ... else
			log.debug(`success url:${toStr(url)}`);
			collector.addSuccess({message: url});
		} catch (e) {
			if (e.name === 'RobotsException') {
				collector.addInformation({message: e.message});
			} else if (e.name === 'NotFoundException') {
				collector.addWarning({message: e.message});
			} else if (e.name === 'ContentTypeException') {
				collector.addInformation({message: e.message});
			} else {
				log.error(`url:${url} message:${e.message}`, e);
				collector.addError({message: `url:${url} ${e.message}`});
			}
		} // try ... catch
	} // while

	// ─────────────────────────────────────────────────────────────────────────
	// 6. Delete old nodes
	// ─────────────────────────────────────────────────────────────────────────
	function deleteOldNodes() {
		/*const filters = addQueryFilter({
			clause: 'mustNot',
			filter: hasValue('url', Object.keys(seenUrisObj))
		});*/
		// log.debug(toStr({filters}));
		const res = collector.queryDocuments({
			aggregations: null,
			count: -1,
			filters: null,
			query: {
				boolean: {
					mustNot: {
						in: {
							field: 'url',
							values: Object.keys(seenUrisObj)
						}
					}
				}
			},
			sort: null,
			start: null
		});
		// log.debug(`res:${toStr(res)}`); // Huuge!
		TRACE && log.debug('count:%s total:%s res.hits.length:%s', res.count, res.total, res.hits.length);

		if (res.hits.length) {
			TRACE && log.debug(`res.hits[0]:${toStr(res.hits[0])}`);
			const idsToDelete: string[] = [];
			const pathsToDelete: string[] = [];
			const nodeId2Uri: Record<string,string> = {};
			for (let i = 0; i < res.hits.length; i += 1) {
				const {id} = res.hits[i];

				const node = collector.collection.connection.get<{
					_path: string
					url: string
				}>(id);
				// log.debug('node:%s', toStr(node));

				if (node) { // Handle ghost nodes
					const {_path, url} = node;
					idsToDelete.push(id);
					pathsToDelete.push(_path);
					nodeId2Uri[id] = url;
				}
			}
			// log.debug(`nodeId2Uri:${toStr(nodeId2Uri)}`);

			if (idsToDelete.length) {
				log.debug('deleting ids:%s paths:%s', toStr(idsToDelete), toStr(pathsToDelete));
				const deleteRes = collector.collection.connection.delete(idsToDelete);
				// log.debug(toStr({deleteRes}));
				const urls = deleteRes.map(nodeId => nodeId2Uri[nodeId]);
				// log.debug(toStr({uris}));
				if (urls.length) {
					urls.forEach((url) => {
						collector.journal.successes.push({message: `url:${url} deleted`});
					});
				}
				collector.collection.connection.refresh();
			}
		} // if res.hits.length
	} // function deleteOldNodes

	if (!collector.shouldStop() && !collector.journal.errors.length) {
		deleteOldNodes();
	}

	collector.stop();
} // function run

import type { Request } from '@enonic-types/core';

import {
	mappedRelativePath,
	requestHandler
} from '/lib/enonic/static';
import {DOCUMENT_REST_API_PATH} from './constants';


const immutableGetter = (request: Request) => requestHandler(
	request,
	{
		contentType: ({
			path,
			// resource
		}) => {
			if (
				path.substring(path.length - 3) === '.js'
				|| path.substring(path.length - 4) === '.mjs'
			) {
				return 'text/javascript';
			} else if (path.substring(path.length - 4) === '.css') {
				return 'text/css';
			} else if (path.substring(path.length - 6) === '.woff2') {
				return 'font/woff';
			} else if (path.substring(path.length - 5) === '.woff') {
				return 'font/woff';
			} else if (path.substring(path.length - 4) === '.ttf') {
				return 'font/ttf';
			}
			return 'octet/stream';
		},
		index: false,
		relativePath: mappedRelativePath(`${DOCUMENT_REST_API_PATH}/static`),
	});


export default immutableGetter;

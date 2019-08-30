import deepEqual from 'fast-deep-equal';
import getIn from 'get-value';
import setIn from 'set-value';
//import {Form as SemanticUiReactForm} from 'semantic-ui-react';
import traverse from 'traverse';

import {EnonicProvider} from './Context';

const INSERT = 'INSERT';
const MOVE_DOWN = 'MOVE_DOWN';
const MOVE_UP = 'MOVE_UP';
//const PUSH = 'PUSH';
const REMOVE = 'REMOVE';
const RESET = 'RESET';
const SET_VALUE = 'SET_VALUE';
const SET_VISITED = 'SET_VISITED';
const SUBMIT = 'SUBMIT';
const VALIDATE_FIELD = 'VALIDATE_FIELD';
const VALIDATE_FORM = 'VALIDATE_FORM';


export const insert = ({index, path, value}) => ({
	index,
	path,
	type: INSERT,
	value
});

export const moveDown = ({index, path}) => ({
	index,
	path,
	type: MOVE_DOWN
});

export const moveUp = ({index, path}) => ({
	index,
	path,
	type: MOVE_UP
});

/*export const push = ({index, path, value}) => ({
	index,
	path,
	type: PUSH,
	value
});*/

export const remove = () => ({
	type: REMOVE
});

export const reset = () => ({
	type: RESET
});

export const setValue = ({path, value}) => ({
	path,
	type: SET_VALUE,
	value
});

export const setVisited = ({path, value = true}) => ({
	path,
	type: SET_VISITED,
	value
});

export const submit = () => ({
	type: SUBMIT
});

export const validateField = ({path, value}) => ({
	path,
	type: VALIDATE_FIELD,
	value
});

export const validateForm = () => ({
	type: VALIDATE_FORM
});


function isFunction(value) {
	return !!(value && value.constructor && value.call && value.apply); // highly performant from underscore
}


export function Form(props) {
	//console.debug('Form props', props);
	const {
		children,
		initialValues = {},
		onDelete,
		onSubmit,
		schema = {},
		...rest
	} = props;
	//console.debug('Form schema', schema);

	const initialState = {
		changes: {},
		errors: {},
		values: initialValues,
		visits: {}
	};

	const reducer = (state, action) => {
		//console.debug('reducer state', state, 'action', action);
		switch (action.type) {
		case INSERT: {
			//console.debug('reducer state', state, 'action', action);
			const deref = JSON.parse(JSON.stringify(state));
			const array = getIn(deref.values, action.path);
			//console.debug('reducer state', state, 'action', action, 'array', array);
			if (!Array.isArray(array)) {
				return state;
			}
			array.splice(array.index, 0, action.value)
			const initialValue = getIn(initialValues, action.path);
			setIn(deref.changes, action.path, !deepEqual(array, initialValue));
			//console.debug('reducer state', state, 'action', action, 'array', array);
			console.debug('reducer action', action, 'state', state, 'deref', deref);
			return deref;
		}
		case MOVE_DOWN: {
			const deref = JSON.parse(JSON.stringify(state));
			const array = getIn(deref.values, action.path);
			if (!Array.isArray(array)) {
				console.error(`path: ${action.path}, not an array!`);
				return state;
			}
			if(action.index + 1 >= array.length) {
				console.error(`path: ${action.path} Can't move item beyond array!`);
				return state;
			}
			const tmp = array[action.index];
			array[action.index] = array[action.index + 1];
			array[action.index + 1] = tmp;
			const initialValue = getIn(initialValues, action.path);
			setIn(deref.changes, action.path, !deepEqual(array, initialValue));
			console.debug('reducer action', action, 'state', state, 'deref', deref);
			return deref;
		}
		case MOVE_UP: {
			const deref = JSON.parse(JSON.stringify(state));
			const array = getIn(deref.values, action.path);
			if (!Array.isArray(array)) {
				console.error(`path: ${action.path}, not an array!`);
				return state;
			}
			if(action.index === 0) {
				console.error(`path: ${action.path} Can't move item to index -1!`);
				return state;
			}
			const tmp = array[action.index];
			array[action.index] = array[action.index - 1];
			array[action.index - 1] = tmp;
			const initialValue = getIn(initialValues, action.path);
			setIn(deref.changes, action.path, !deepEqual(array, initialValue));
			console.debug('reducer action', action, 'state', state, 'deref', deref);
			return deref;
		}
		/*case PUSH: {
			const deref = JSON.parse(JSON.stringify(state));
			const array = getIn(deref.values, action.path);
			if (!Array.isArray(array)) {
				return state;
			}
			array.push(action.value)
			const initialValue = getIn(initialValues, action.path);
			setIn(deref.changes, action.path, deepEqual(array, initialValue));
			return deref;
		}*/
		case REMOVE: {
			onDelete(state.values);
			return state;
		}
		case RESET: return initialState;
		case SET_VALUE: {
			if (action.value === getIn(state.values, action.path)) {
				//console.debug('reducer action', action, 'did not change state', state);
				return state;
			}
			const deref = JSON.parse(JSON.stringify(state));
			setIn(deref.values, action.path, action.value);
			const initialValue = getIn(initialValues, action.path);
			setIn(deref.changes, action.path, action.value !== initialValue);
			//console.debug('reducer action', action, 'deref', deref);
			return deref;
		}
		case SET_VISITED: {
			if (action.value === getIn(state.visits, action.path)) {
				//console.debug('reducer action', action, 'did not change state', state);
				return state;
			}
			const deref = JSON.parse(JSON.stringify(state));
			setIn(deref.visits, action.path, action.value);
			//console.debug('reducer action', action, 'deref', deref);
			return deref;
		}
		case SUBMIT: {
			onSubmit(state.values);
			return state;
		}
		case VALIDATE_FIELD: {
			const fn = getIn(schema, action.path);
			if (!isFunction(fn)) {
				//console.debug('reducer action', action, "doesn't have a validator function state", state);
				return state;
			}
			const error = fn(action.value);
			if (error === getIn(state.errors, action.path)) {
				//console.debug('reducer action', action, 'did not change state', state);
				return state;
			}
			const deref = JSON.parse(JSON.stringify(state));
			setIn(deref.errors, action.path, error);
			//console.debug('reducer action', action, 'deref', deref);
			return deref;
		}
		case VALIDATE_FORM: {
			const errors = {};
			const visits = {};
			traverse(schema).forEach(function (x) { // fat-arrow destroys this
				if (this.notRoot && this.isLeaf && isFunction(x)) {
					const path = this.path; //console.debug('path', path);
					const value = getIn(state.values, path); //console.debug('value', value);
					//const prevError = getIn(state.errors, path); console.debug('prevError', prevError);
					const newError = x(value); //console.debug('newError', newError);
					newError && setIn(errors, path, newError);
					setIn(visits, path, true);
					//console.debug('node', this.node);
				}
			});
			//console.debug('errors', errors);
			//console.debug('visits', visits);
			const deref = JSON.parse(JSON.stringify(state));
			deref.errors = errors;
			deref.visits = visits;
			return deref;
		}
		default: return state;
		} // switch
	}; // reducer

	return <EnonicProvider
		children={children}
		initialState={initialState}
		reducer={reducer}
	/>;
} // Form

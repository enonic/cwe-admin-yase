//import getIn from 'get-value';
import {
	Button, Dimmer, Header, Icon, Label, Loader, Popup, Radio, Segment, Table
} from 'semantic-ui-react';

import {EditSynonymsModal} from './thesaurus/EditSynonymsModal';
//import {NewOrEditSynonym} from './thesaurus/NewOrEditSynonym';
import {NewOrEditThesaurus} from './thesaurus/NewOrEditThesaurus';
import {DeleteThesaurus} from './thesaurus/DeleteThesaurus';
import {Import} from './thesaurus/Import';


const GQL_LOCALES_GET = `getLocales {
	country
	#displayCountry
	#displayLanguage
	displayName
	#displayVariant
	#language
	tag
	#variant
}`;

const GQL_THESAURI_QUERY = `queryThesauri {
	total
	count
	hits {
		_id
		_name
		_nodeType
		_path
		description
		language {
			from
			to
		}
		synonymsCount
	}
}`;

const GQL_ON_MOUNT = `{
	${GQL_LOCALES_GET}
	${GQL_THESAURI_QUERY}
}`;

const GQL_ON_UPDATE = `{
	${GQL_THESAURI_QUERY}
}`;


export function Thesauri(props) {
	//console.debug('Thesauri props', props);
	const {
		licenseValid,
		servicesBaseUrl,
		setLicensedTo,
		setLicenseValid
	} = props;
	//console.debug('Thesauri licenseValid', licenseValid);

	const [isLoading, setLoading] = React.useState(false);
	const [locales, setLocales] = React.useState([]);
	const [showDelete, setShowDelete] = React.useState(false);
	const [synonymsSum, setSynonymsSum] = React.useState(0);
	const [thesauriRes, setThesauriRes] = React.useState({
		count: 0,
		hits: [],
		total: 0
	});

	function fetchOnMount() {
		setLoading(true);
		fetch(`${servicesBaseUrl}/graphQL`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: GQL_ON_MOUNT })
		})
			.then(res => res.json())
			.then(res => {
				if (res && res.data) {
					setLocales(res.data.getLocales);
					setThesauriRes(res.data.queryThesauri);
					let sum = res.data.queryThesauri.total ? res.data.queryThesauri.hits
						.map(({synonymsCount}) => synonymsCount)
						.reduce((accumulator, currentValue) => accumulator + currentValue) : 0;
					setSynonymsSum(sum);
					setLoading(false);
				} // if
			}); // then
	} // fetchOnMount

	function fetchOnUpdate() {
		setLoading(true);
		fetch(`${servicesBaseUrl}/graphQL`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: GQL_ON_UPDATE })
		})
			.then(res => res.json())
			.then(res => {
				if (res && res.data) {
					setThesauriRes(res.data.queryThesauri);
					let sum = res.data.queryThesauri.total ? res.data.queryThesauri.hits
						.map(({synonymsCount}) => synonymsCount)
						.reduce((accumulator, currentValue) => accumulator + currentValue) : 0;
					setSynonymsSum(sum);
					setLoading(false);
				} // if
			}); // then
	} // fetchOnUpdate

	React.useEffect(() => fetchOnMount(), []);

	return <>
		<Segment basic inverted style={{
			marginLeft: -14,
			marginTop: -14,
			marginRight: -14
		}}>
			<Table basic collapsing compact inverted>
				<Table.Body>
					<Table.Row verticalAlign='middle'>
						<Table.Cell collapsing>
							<Radio
								checked={showDelete}
								onChange={(ignored,{checked}) => {
									setShowDelete(checked);
								}}
								toggle
							/>
							<Label color='black' size='large'>Show delete</Label>
						</Table.Cell>
					</Table.Row>
				</Table.Body>
			</Table>
		</Segment>
		<Header as='h1'>Synonyms</Header>
		<Dimmer.Dimmable dimmed={isLoading}>
			<Table celled collapsing compact selectable sortable striped attached='top'>
				<Table.Header>
					<Table.Row>
						<Table.HeaderCell>Edit</Table.HeaderCell>
						<Table.HeaderCell>Name</Table.HeaderCell>
						<Table.HeaderCell>From Language</Table.HeaderCell>
						<Table.HeaderCell>To Language</Table.HeaderCell>
						<Table.HeaderCell>Synonyms</Table.HeaderCell>
						<Table.HeaderCell>Actions</Table.HeaderCell>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{thesauriRes.hits.map(({
						//description,
						_id,
						_name,
						language = {
							from: '',
							to: ''
						},
						language: {
							from = '',
							to = ''
						} = {},
						synonymsCount
					}, index) => {
						return <Table.Row key={index}>
							<Table.Cell collapsing>
								<NewOrEditThesaurus
									_id={_id}
									_name={_name}
									language={language}
									licenseValid={licenseValid}
									locales={locales}
									onClose={fetchOnUpdate}
									servicesBaseUrl={servicesBaseUrl}
								/>
							</Table.Cell>
							<Table.Cell collapsing>{_name}</Table.Cell>
							<Table.Cell collapsing>{from}</Table.Cell>
							<Table.Cell collapsing>{to}</Table.Cell>
							<Table.Cell collapsing>{synonymsCount}</Table.Cell>
							<Table.Cell collapsing>
								<Button.Group>
									{/*<NewOrEditSynonym
										onClose={fetchOnUpdate}
										servicesBaseUrl={servicesBaseUrl}
										thesaurusId={_id}
									/>*/}
									{/*<EditSynonymsModal
										onClose={fetchOnUpdate}
										servicesBaseUrl={servicesBaseUrl}
										thesaurusId={_id}
										thesaurusName={_name}
									/>*/}
									<Import
										name={_name}
										onClose={fetchOnUpdate}
										servicesBaseUrl={servicesBaseUrl}
									/>
									<Popup
										content={`Export from thesaurus ${_name}`}
										inverted
										trigger={<Button
											as='a'
											icon
											href={`${servicesBaseUrl}/thesaurusExport?name=${_name}`}
										><Icon color='blue' name='download'/></Button>}
									/>
									{showDelete ? <DeleteThesaurus
										_id={_id}
										name={_name}
										onClose={fetchOnUpdate}
										servicesBaseUrl={servicesBaseUrl}
									/> : null}
								</Button.Group>
							</Table.Cell>
						</Table.Row>;
					})}
				</Table.Body>
				<Table.Footer>
					<Table.Row>
						<Table.HeaderCell><EditSynonymsModal
							onClose={fetchOnUpdate}
							servicesBaseUrl={servicesBaseUrl}
						/></Table.HeaderCell>
						<Table.HeaderCell></Table.HeaderCell>
						<Table.HeaderCell></Table.HeaderCell>
						<Table.HeaderCell></Table.HeaderCell>
						<Table.HeaderCell>{synonymsSum}</Table.HeaderCell>
						<Table.HeaderCell></Table.HeaderCell>
					</Table.Row>
				</Table.Footer>
			</Table>
			<Dimmer active={isLoading} inverted><Loader size='massive'>Loading</Loader></Dimmer>
		</Dimmer.Dimmable>
		<NewOrEditThesaurus
			language={{from: '', to: ''}}
			licenseValid={licenseValid}
			locales={locales}
			onClose={fetchOnUpdate}
			servicesBaseUrl={servicesBaseUrl}
			setLicensedTo={setLicensedTo}
			setLicenseValid={setLicenseValid}
		/>
	</>;
} // Thesauri

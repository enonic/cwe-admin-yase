import type {
	SetLicensedToFunction,
	SetLicenseValidFunction
} from './index.d';


import * as React from 'react';
import {
	Button, Form, Icon, Input, Message, Modal
} from 'semantic-ui-react';


export const UploadLicense = (props :{
	servicesBaseUrl :string
	setLicensedTo :SetLicensedToFunction
	setLicenseValid :SetLicenseValidFunction
	whenValid ?:() => void
}) => {
	const {
		servicesBaseUrl,
		setLicensedTo,
		setLicenseValid,
		whenValid = () => {/**/}
	} = props;
	const [uploadedLicenseValid, setUploadedLicenseValid] = React.useState(true);
	const [file, setFile] = React.useState<File>();
	return <>
		<Modal.Header>License check</Modal.Header>
		<Modal.Content>
			<Form onSubmit={(event) => {
				event.preventDefault(); // Stop form submit
				//console.debug(event, file);
				const formData = new FormData();
				formData.append('license', file);
				fetch(`${servicesBaseUrl}/uploadLicense`, {
					body: formData,
					headers: {
						'Content-type': 'multipart/form-data'
					},
					method: 'POST'
				}).then(response => response.json())
					.then(data => {
						//console.debug(data);
						const {licenseText, licenseValid} = data;
						//console.debug(licenseValid);
						if (licenseValid) {
							setUploadedLicenseValid(true);
							setLicenseValid(true);
							setLicensedTo(licenseText);
							whenValid();
						} else {
							setUploadedLicenseValid(false);
						}
					});
			}}>
				<Form.Field>
					{uploadedLicenseValid
						? <Message>
							<Message.Content>No license found. Please upload your license.<br/>Don&apos;t have a license? &rarr; <a href="https://enonic.com/contact-us" target="_blank" rel="noreferrer">Contact Enonic</a>.</Message.Content>
						</Message>
						: <Message icon negative>
							<Icon name='warning sign'/>
							<Message.Content>Uploaded license invalid, please try again.</Message.Content>
						</Message>}
					<Input
						onChange={(event :React.ChangeEvent<HTMLInputElement>) => {
							//console.debug(event);
							setFile(event.target.files[0]);
						}}
						type='file'
					/>
				</Form.Field>
				<Button icon type='submit'><Icon name='upload'/></Button>
			</Form>
		</Modal.Content>
	</>;
}

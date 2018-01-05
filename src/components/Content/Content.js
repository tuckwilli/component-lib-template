import React from 'React';
import { Header } from '../Header/Header'

class Content extends React.Component {
	render () {
		const foo = ['bar', 'biz', 'baz'];
		const biz = { foo: 'no', bar: 'sir' };
		const bar = { ...biz, foo }

		return ([
			<Header key={0} />,
			<p key={1}>I am the content</p>
		]);
	}
}

export { Content };

import React from 'react';
import { mount } from 'enzyme';

import { Content } from './Content';

describe('A suite', function() {
	it('should render without throwing an error', function() {
		expect(mount(<Content />).find('p').text()).toBe('I am the content');
	});
});

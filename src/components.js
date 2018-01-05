const req = require.context('./components', true, /^((?!(test)).)*\.js$/);
req.keys().forEach(req);

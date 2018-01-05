const
	sass = require('node-sass'),
	fs = require('fs'),
	path = require('path');

const
	LIB_NAME = 'my-lib',
	THEMES_DIR = path.resolve(__dirname, './themes'),
	COMMON_DIR = path.resolve(__dirname, './themes/shared'),
	COMPONENTS_DIR = path.resolve(__dirname, './components'),
	DIST_DIR = path.resolve(__dirname, '../dist'),
	DIST_DIR_SCSS = path.resolve(DIST_DIR, './scss'),
	DIST_DIR_CSS = path.resolve(DIST_DIR, './css');

// helpers
const logError = err => { console.log(err); };
const flatten = array => { return [].concat(...array); };

// wrap sass.render in a promise
const renderSass = options => {
	return new Promise((resolve, reject) => {
		sass.render(options, (err, result) => {
			if (err) reject(err);
			else resolve(result);
		});
	});
};

// create a function that wraps most async fs methods and returns a promise
const promisifyFS = method => {
	return arg => {
		return new Promise((resolve, reject) => {
			fs[method](arg, (err, value) => {
				if (err) reject(err);
				else if(value) resolve(value);
				else resolve();
			});
		});
	};
};

// wraps some fs methods to return promises
const readdir = promisifyFS('readdir');
const lstat = promisifyFS('lstat');
const rmdir = promisifyFS('rmdir');
const mkdir = promisifyFS('mkdir');
const unlink = promisifyFS('unlink');

// rmdir but it resolves if the dir doesn't exist to begin with
const rmdirIfExists = dir => {
	return new Promise((resolve, reject) => {
		rmdir(dir).then(() => {
			resolve();
		})
		.catch(err => {
			if(err.code === 'ENOENT') resolve();
			else reject(err);
		});
	});
};

// wrap writeFile to return a promise
const writeFile = (file, data) => {
	return new Promise((resolve, reject) => {
		fs.writeFile(file, data, err => {
			if (err) reject(err);
			else resolve();
		});
	});
};

// wrap stream.write() to return a promise
const writeToStream = (stream, data) => {
	return new Promise((resolve, reject) => {
		stream.write(data, err => {
			if (err) reject(err);
			else resolve();
		});
	});
};

// unlinks all files in a dir, errors if there are directories in the dir
// resolves true if the dir has files that were deleted,
// resolves false if the dir didn't exist
const emptyDir = dir => {
	return new Promise((resolve, reject) => {
		readdir(dir).then(files => {
			return Promise.all(
				files.map(file => unlink(path.resolve(dir, file)))
			);
		})
		.then(() => { resolve(true); })
		.catch(err => {
			if(err.code === 'ENOENT') resolve(false);
			else logError(err);
		});
	});
};

// unlinks files in dir, removes dir, remakes dir
// if dir doesn't exist, it gets made
const cleanDir = dir => {
	return emptyDir(dir).then(isCleaned => {
		if(isCleaned) return rmdirIfExists(dir);
		else return;
	})
	.then(() => { return mkdir(dir); })
	.catch(logError);
}

// returns a promise that resolves to an array
// with an object for each item in the directory
// resembling { location, isDirectory }
//
// options are { includeDirs, omitFIles, filterFiles }
// filterFiles is a regex that every filename will be
// tested against, and only files that pass will get
// returned
const getItemsInDir = (dir, options = {}) => {
	return readdir(dir).then(files => {
		const targetFiles = options.filterFiles
			? files.filter(file => options.filterFiles.test(file))
			: files;

		return Promise.all(
			targetFiles.sort().map(file => {
				return new Promise((resolve, reject) => {
					const location = path.resolve(dir, file);

					lstat(path.resolve(dir, file)).then(stat => {
						if(stat.isFile()) resolve({ location, isDirectory: false });
						else if(stat.isDirectory()) resolve({ location, isDirectory: true });
						else resolve(null);
					})
					.catch(err => { reject(err); });
				});
			})
		);
	})
	.then(files => {
		if(options.includeDirs === true) return files.filter(file => file !== null);
		else if(options.omitFiles === true) return files.filter(file => file !== null && file.isDirectory);
		else return files.filter(file => file !== null && !file.isDirectory);
	})
	.catch(logError);
};

// gets an array of all scss files in component subdirectories
const getComponentStyles = () => {
	return getItemsInDir(COMPONENTS_DIR, { omitFiles: true }).then(dirs => {
		return Promise.all(
			dirs.map(dir => {
				return new Promise((resolve, reject) => {
					getItemsInDir(dir.location, { filterFiles: /\.scss$/ }).then(files => {
						resolve(files);
					})
					.catch(err => { reject(err); });
				});
			})
		)
		.then(componentStyles => {
			return flatten(componentStyles).map(style => style.location);
		});
	});
};

// gets an array of all scss files in the ./themes/shared directory
const getSharedStyles = () => {
	return getItemsInDir(COMMON_DIR).then(sharedStyles => {
		return flatten(sharedStyles).map(style => style.location);
	});
};

// gets an array of all scss files that will be common to every theme (i.e. all component styles and all shared styles)
const getCommonStyles = () => {
	return Promise.all([getSharedStyles(), getComponentStyles()]).then(commonStyles => {
		return { sharedStyles: commonStyles[0], componentStyles: commonStyles[1] };
	});
};

// writes the theme specific css and scss
const writeThemeStyles = () => {
	return getCommonStyles().then(commonStyles => {
		return new Promise((resolve, reject) => {
			getItemsInDir(THEMES_DIR, { filterFiles: /\.theme\.scss/ }).then(themes => {
				resolve({ themes, commonStyles });
			})
			.catch(err => { reject(err) });
		});
	})
	.then(allStyles => {
		const renderPromises = [];

		allStyles.themes.forEach(theme => {
			const writePromises = [];
			const themename = theme.location.match(/themes\/(.*?)\.theme.scss/);
			const filename = `${LIB_NAME}.${themename[1]}.`;
			const scssFile = path.resolve(DIST_DIR_SCSS, filename) + 'scss';
			const cssFile = path.resolve(DIST_DIR_CSS, filename) + 'css';
			const scssFileStream = fs.createWriteStream(scssFile);
			const themeStyles = [
				...allStyles.commonStyles.sharedStyles,
				theme.location,
				...allStyles.commonStyles.componentStyles,
			];

			themeStyles.forEach(style => {
				const relativeStyle = path.relative(DIST_DIR_SCSS, style);

				writePromises.push(
					writeToStream(scssFileStream, `@import '${relativeStyle}';\n`).catch(logError)
				);
			});

			scssFileStream.end();

			renderPromises.push(
				Promise.all(writePromises).then(() => {
					console.log('rendered', '\x1b[32m', `${filename}scss`, '\x1b[0m', 'to', '\x1b[33m', DIST_DIR_SCSS, '\x1b[0m');

					return renderSass({
						file: scssFile,
						outFile: cssFile,
						sourceMap: true,
					});
				})
				.then(result => {
					console.log('rendered', '\x1b[35m', `${filename}css`, '\x1b[0m', 'to', '\x1b[33m', DIST_DIR_CSS, '\x1b[0m');

					return writeFile(cssFile, result.css);
				})
				.catch(err => {
					console.log('\x1b[41m\x1b[30m', '↓↓↓↓↓↓↓↓↓↓', `ERROR RENDERING ${themename[0]}`, '↓↓↓↓↓↓↓↓↓↓', '\x1b[0m');
					console.log(err.file);
					console.log('line:', err.line + ',', 'column:', err.column + ':', `\x1b[31m${err.message}\x1b[0m`);
				})
			);
		});

		return Promise.all(renderPromises);
	})
	.catch(logError);
};

const compile = () => {
	const startTime = (new Date()).getTime();
	
	return Promise.all([cleanDir(DIST_DIR_SCSS), cleanDir(DIST_DIR_CSS)]).then(() => {
		return writeThemeStyles();
	})
	.catch(logError)
	.then(() => { console.log('completed rendering styles in', `${(new Date()).getTime() - startTime}ms`); });
};

compile();

if (process.argv.indexOf('--watch') !== -1 || process.argv.indexOf('-w') !== -1) {
	console.log('watching scss files');

	fs.watch(__dirname, { recursive: true }, (eventType, filename) => {
		if(filename && /\.scss$/.test(filename)) {
			console.log(filename + ' changed. recompiling...');
			compile();
		}
	});
}

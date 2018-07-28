// TODO the functions that get called after the various prompts should be refactored into a reusable function
// TODO prompt params should probably be set outside of the prompt call (look at docs)
// TODO dont use set timeout for the deletion of the files obs. make a callback or promise or something
// TODO maybe peek to see if babelrc exists and use that
// TODO add like all the presets normally so we don't error out
// ! research for webpack, etc after prompting for root, and run the 'use their own webpack' function after abstracting it out
const fs = require('fs');
const path = require('path');
const prompt = require('prompt');
const cmd = require('node-cmd');
const babylon = require('babylon');
const traverse = require('babel-traverse').default;
const babel = require('babel-core');

// stuff for the prompt down below
prompt.start();

const distDirPath = path.join(__dirname, '..', 'dist');
const filesToDeleteAfterRunning = [
  path.join(__dirname, '..', 'dist', 'bundle.js'),
  path.join(__dirname, '..', 'dist', 'index.html'),
];

const getFiles = require('./get-files-from-root.js');
const createWebpackConfig = require('./webpack-template');

// dev testing purposes only
const scrumEntry = '../../../week-5/reactscrumboard/src/index.js';
const scrumRoot = '/Users/bren/Codesmith/week-5/reactscrumboard';

const indecisionEntry = '../../../../React/1-indecisionApp/src/app.js';
const indecisionRoot = '/Users/bren/React/1-indecisionApp';

const expensifyEntry = '../../../../React/2-expensify/src/app.js';
const expensifyRoot = '/Users/bren/React/2-expensify';

const entryFile = indecisionEntry;

const absolutePath = path.resolve(entryFile);
const rootDir = path.dirname(absolutePath);

function sameDirectoryAspackageJSON(fileEntry) {
  return fileEntry.name === 'package.json' && fileEntry.fullParentDir === rootDir;
}
// this could easily be placed back in the getfiles function
// i moved it out because i use the same functionality twice.
// if you just paste the code twice, you don't need to have extenisons as an argument. it is available in scope down below
function createWebpackConfigAndSave(entryFile, extensions, outputPath, indexHtmlPath, cb) {
  const dynamicWebpackConfig = createWebpackConfig(
    entryFile,
    extensions,
    outputPath || path.join(__dirname, '..', 'dist'),
    indexHtmlPath || path.join(__dirname, 'template.html')
  );
  const webpackConfigSavePath = path.join(__dirname, '..', 'webpack.config.js');
  fs.writeFile(webpackConfigSavePath, dynamicWebpackConfig, (err, res) => {
    if (err) throw new Error(err);
    filesToDeleteAfterRunning.push(webpackConfigSavePath);
    // after writing, send the path to our callback to be used to run the shell script on our config file
    if (cb && cb.constructor.name === 'Function') cb(webpackConfigSavePath);
  });
}

getFiles(rootDir, (err, res) => {
  const webpackConfig = { exists: false, path: null, content: null };
  let entryIsInRoot = false;
  let indexHtmlPath;
  let files = res.reduce((files, fileInfo) => {
    // check if entry file is in root of project
    if (!entryIsInRoot && sameDirectoryAspackageJSON(fileInfo)) entryIsInRoot = true;

    const { name } = fileInfo;
    // TODO prompt if multiple webpack configs found
    if (name === 'webpack.config.js' && !webpackConfig.exists) {
      webpackConfig.exists = true;
      webpackConfig.content = fs.readFileSync(fileInfo.fullPath, 'utf-8');
      webpackConfig.info = fileInfo;
    }
    if (name === 'index.html' && !indexHtmlPath) indexHtmlPath = fileInfo.fullPath;
    return files.concat(name);
  }, []);
  const extensions = files.map(filename => path.extname(filename));
  // this will not check for webpack in folders above the current directory yet.
  if (webpackConfig.exists) {
    // let them choose if they want to use our config
    prompt.get(
      [
        {
          name: 'answer',
          description:
            'We can generate a new configuration file, but It looks like you already have a webpack configuration file set up. Would you like us to use that?(y/n)',
          type: 'string',
          pattern: /^y(es)?$|^no?$/,
          message: `Answer must be 'yes', 'no', 'y', or 'n'`,
          default: 'y',
          required: true,
        },
      ],
      (err, { answer }) => {
        if (err) throw new Error(err);
        if (answer === 'n' || answer === 'no') {
          //if they do want to use our config, dont write it to their project yet, but use a new config
          createWebpackConfigAndSave(
            entryFile,
            extensions,
            null,
            indexHtmlPath,
            // this is the callback function we are passing in to the write file command
            webpackConfigSavePath => {
              // build the production build
              cmd.get(`webpack --config ${webpackConfigSavePath} --mode production`, (err, res) => {
                if (err) throw new Error(err);
                console.log(res);
                // build the development build
                cmd.get(
                  `webpack --config ${webpackConfigSavePath} --mode development`,
                  (err, res) => {
                    if (err) throw new Error(err);
                    console.log(res);
                    console.log('production and development builds successful');
                  }
                );
              });
            }
          );
        } else if (answer === 'y' || answer === 'yes') {
          console.log('running existing webpack.config.js');
          // if not, run their config
          // run the production build
          console.log(webpackConfig.info.fullPath);
          cmd.get(
            `webpack --config ${webpackConfig.info.fullPath} --mode production`,
            (err, res) => {
              if (err) throw new Error(err);
              console.log(res);
              // build the development build
              cmd.get(
                `webpack --config ${webpackConfig.info.fullPath} --mode development`,
                (err, res) => {
                  if (err) throw new Error(err);
                  console.log(res);
                  console.log('production and development builds successful');
                }
              );
            }
          );
        }
      }
    );
  } else {
    // when no config file found and package.json not in same directory as entry
    prompt.get(
      [
        {
          name: 'answer',
          description: 'Is this file in your root directory?',
          type: 'string',
          pattern: /^y(es)?$|^no?$/,

          message: `Answer must be 'yes', 'no', 'y', or 'n'`,
          default: 'y',
          required: true,
        },
      ],
      (err, { answer }) => {
        if (err) throw new Error(err);
        if (answer === 'y' || answer === 'yes') {
          console.log('building webpack config');
          createWebpackConfigAndSave(entryFile, extensions, null, indexHtmlPath, res => {
            console.log('webpack build finished');
          });
        } else if (answer === 'n' || answer === 'no') {
          prompt.get(
            [
              {
                name: 'answer',
                description: 'Please drag a file from your root directory:',
                type: 'string',
                default: 'y',
                required: true,
              },
            ],
            (err, { answer: confirmedRootDir }) => {
              const tempFile = 'temp.js';
              const pathFromRootToEntry = './' + path.relative(confirmedRootDir, absolutePath);
              const tempFileContent = `import '${pathFromRootToEntry}'`;
              const writePathWithName = confirmedRootDir + tempFile;
              console.log(writePathWithName);

              fs.writeFile(writePathWithName, tempFileContent, (err, res) => {
                if (err) throw new Error(err);
                console.log('temp file written');
                filesToDeleteAfterRunning.push(writePathWithName);
                // now that we have the temp file that imports their entry, we create a config that uses that entry point and  write that
                getFiles(confirmedRootDir, (err, res) => {
                  const webpackConfig = { exists: false, path: null, content: null };
                  let entryIsInRoot = true;
                  let indexHtmlPath;
                  let files = res.reduce((files, fileInfo) => {
                    const { name } = fileInfo;
                    // TODO prompt if multiple webpack configs found
                    if (name === 'webpack.config.js' && !webpackConfig.exists) {
                      webpackConfig.exists = true;
                      webpackConfig.content = fs.readFileSync(fileInfo.fullPath, 'utf-8');
                      webpackConfig.info = fileInfo;
                    }
                    if (name === 'index.html' && !indexHtmlPath) indexHtmlPath = fileInfo.fullPath;
                    return files.concat(name);
                  }, []);
                  const extensions = files.map(filename => path.extname(filename));
                  // this will not check for webpack in folders above the current directory yet.
                  if (webpackConfig.exists) {
                    // let them choose if they want to use our config
                    prompt.get(
                      [
                        {
                          name: 'answer',
                          description:
                            'We can generate a new configuration file, but It looks like you already have a webpack configuration file set up. Would you like us to use that?(y/n)',
                          type: 'string',
                          pattern: /^y(es)?$|^no?$/,
                          message: `Answer must be 'yes', 'no', 'y', or 'n'`,
                          default: 'y',
                          required: true,
                        },
                      ],
                      (err, { answer }) => {
                        if (err) throw new Error(err);
                        if (answer === 'n' || answer === 'no') {
                          //if they do want to use our config, dont write it to their project yet, but use a new config
                          createWebpackConfigAndSave(
                            writePathWithName,
                            extensions,
                            null,
                            indexHtmlPath,
                            // this is the callback function we are passing in to the write file command
                            webpackConfigSavePath => {
                              // build the production build
                              cmd.get(
                                `webpack --config ${webpackConfigSavePath} --mode production`,
                                (err, res) => {
                                  if (err) throw new Error(err);
                                  console.log(res);
                                  // build the development build
                                  cmd.get(
                                    `webpack --config ${webpackConfigSavePath} --mode development`,
                                    (err, res) => {
                                      if (err) throw new Error(err);
                                      console.log(res);
                                      console.log('production and development builds successful');
                                    }
                                  );
                                }
                              );
                            }
                          );
                          // TODO If they choose this, need to alter the config file to the temp.js insteaf of the entry they specified
                        } else if (answer === 'y' || answer === 'yes') {
                          // Generate an AST from their config, replace their entry with our temp file, and then save that config to our
                          const ast = babylon.parse(webpackConfig.content, {
                            sourceType: 'module',
                          });
                          // TODO it seems to break if they use require.resolve. maybe need to scrape all of those;
                          // TODO change the output to dist if writing a new tamplate to our local directory from their config file base
                          //   /Users/bren/React/1-indecisionApp/
                          // ! TRAVERSE FILE AND CHANGE ENTRY, THEN WRITE AS TEMP CONFIG LOCALLY, AND THEN RUN (AND CHANGE ALL TO REQUIRE.RESOLVE
                          traverse(ast, {
                            enter(path) {
                              const outputObject = {
                                path: distDirPath,
                                filename: 'bundle.js',
                              };
                              if (path.node.type === 'Identifier' && path.node.name === 'entry') {
                                path.parent.value = babel.types.valueToNode(writePathWithName);
                              }
                              if (path.node.type === 'Identifier' && path.node.name === 'output') {
                                path.parent.value = babel.types.valueToNode(outputObject);
                              }
                            },
                          });
                          const { code: userWebpackWithNewTempJSEntry } = babel.transformFromAst(
                            ast,
                            null,
                            {
                              presets: ['env'],
                            }
                          );
                          const webpackWithTempJSEntrySavePath = path.join(
                            __dirname,
                            '..',
                            'webpack.config.js'
                          );
                          fs.writeFile(
                            webpackWithTempJSEntrySavePath,
                            userWebpackWithNewTempJSEntry,
                            (err, res) => {
                              if (err) throw new Error(err);
                              filesToDeleteAfterRunning.push(webpackWithTempJSEntrySavePath);
                            }
                          );
                          console.log('running existing webpack.config.js');
                          // if not, run their config
                          // run the production build
                          cmd.get(
                            `webpack --config ${webpackWithTempJSEntrySavePath} --mode production`,
                            (err, res) => {
                              if (err) throw new Error(err);
                              console.log(res);
                              // build the development build
                              cmd.get(
                                `webpack --config ${webpackWithTempJSEntrySavePath} --mode development`,
                                (err, res) => {
                                  if (err) throw new Error(err);
                                  console.log(res);
                                  console.log('production and development builds successful');
                                }
                              );
                            }
                          );
                        }
                      }
                    );
                  }
                });
              });
            }
          );
        }
      }
    );
  }
});
// setTimeout(() => {
//   console.log('deleting');
//   filesToDeleteAfterRunning.forEach((path, i, arr) => {
//     console.log(path);
//     fs.unlink(path, (err, res) => {
//       if (i === arr.length - 1) {
//         console.log('last file deleted');
//         fs.rmdir(distDirPath, (err, res) => console.log('dist directory deleted'));
//       }
//     });
//   });
// }, 20000);

// this will save the dynamicwebpackconfig to their root directory for when we want that
// if they want a specific output folder for their bundle file or a specific name, we will need to ask for those

// const dynamicWebpackConfig = createWebpackConfig(
//   entryFile,
//   extensions,
//   path.join(rootDir, 'dist'),
//   indexHtmlPath
// );
// const fileNameWithPathToRoot = path.join(rootDir, 'webpack.config.js');
// fs.writeFile(fileNameWithPathToRoot, dynamicWebpackConfig, (err, res) => {
//   console.log('file written');
// });

import { exit } from 'process';
import {
    asyncForEach,
    childRunCommand,
    customSort,
    findImportsFromDir,
    findStrFromDir,
    getArgs,
    greenLog,
    listDirsRecursive,
    readFile,
    readJsonFile,
    redLog,
    replaceAutogen,
    replaceFileContent,
    spawnCommand,
    spawnListener,
    writeFile,
} from './utils.mjs';
import fs from 'fs';

const args = getArgs();

const OPTION = args[0];

if (!OPTION || OPTION === '' || OPTION === '--help') {
    greenLog(
        `
        Usage: node tools/scripts/tools.mjs [option][...args]
        Options:
            --help: show this help
            --create: create a new app
            --path: a directory to run commands in
            --test: run tests
            --find: different search options
            --publish: publish to npm
            --yalc: publish to yalc
            --build: build the project
            --switch: 
            --dev: run dev stuff
            --watch: watch for changes
    `,
        true
    );
    exit();
}

if (OPTION === '--create') {
    let APP_TYPE = args[1];

    if (!APP_TYPE || APP_TYPE === '' || APP_TYPE === '--help') {
        greenLog(
            `
        Usage: node tools/scripts/tools.mjs --create [app-type]
        [app-type]: the type of app to create
        Options:
        --react: create a react app
        --html: create a html app
        --node: create a node app
        `,
            true
        );
        exit();
    }

    let APP_NAME = args[2];
    const TYPE = args[3];

    if (APP_TYPE === '--react') {
        if (!TYPE || TYPE === '' || TYPE === '--help') {
            greenLog(
                `
            Usage: node tools/scripts/tools.mjs --create --react [app_name] [type]
            [type]: the type of react app to create
            Options:
            --demo: prepend 'demo' and append '-react' to the app name
            `,
                true
            );
        }

        if (TYPE === '--demo') {
            APP_NAME = `demo-${APP_NAME}-react`;
        }

        const INSTALL_PATH = `apps/${APP_NAME}`;

        await childRunCommand(
            `git clone https://github.com/LIT-Protocol/demo-project-react-template ${INSTALL_PATH}`
        );

        await writeFile(
            `${INSTALL_PATH}/src/App.js`,
            replaceAutogen({
                oldContent: await readFile(`${INSTALL_PATH}/src/App.js`),
                startsWith: '// ----- autogen:app-name:start  -----',
                endsWith: '// ----- autogen:app-name:end  -----',
                newContent: `const [appName, setAppName] = useState('${APP_NAME}');`,
            })
        );

        const indexHtml = await readFile(`${INSTALL_PATH}/public/index.html`);
        const newHtml = indexHtml.replace('Demo', `Demo: ${APP_NAME}`);
        await writeFile(`${INSTALL_PATH}/public/index.html`, newHtml);

        await childRunCommand(`rm -rf ${INSTALL_PATH}/.git`);

        const packageJson = await readJsonFile(`${INSTALL_PATH}/package.json`);
        packageJson.name = APP_NAME;

        // generate a port number between 4100 and 4200
        const port = Math.floor(Math.random() * 100) + 4100;
        packageJson.scripts.start = `PORT=${port} react-scripts start`;

        await writeFile(
            `${INSTALL_PATH}/package.json`,
            JSON.stringify(packageJson, null, 2)
        );

        await childRunCommand(`cd ${INSTALL_PATH} && yarn install`);

        greenLog(`Creating a project.json for nx workspace`);

        const projectJson = await readFile(`tools/scripts/project.json.template`);
        const newProjectJson = projectJson
            .replaceAll('PROJECT_NAME', APP_NAME)
            .replaceAll('PROJECT_PATH', `apps/${APP_NAME}`)
            .replaceAll('PROJECT_PORT', port);

        await writeFile(`${INSTALL_PATH}/project.json`, newProjectJson);

        greenLog('Adding project to nx workspace');

        const workspaceJson = await readJsonFile(`workspace.json`);

        workspaceJson.projects[APP_NAME] = INSTALL_PATH;

        await writeFile(`workspace.json`, JSON.stringify(workspaceJson, null, 2));

        greenLog('Done!');
    }

    if (APP_TYPE == '--html') {
        if (!TYPE || TYPE === '' || TYPE === '--help') {
            greenLog(
                `
            Usage: node tools/scripts/tools.mjs --create --html [type]
            [type]: the type of html app to create
            Options:
            --demo: prepend 'demo' and append '-html' to the app name
            `,
                true
            );
        }

        redLog('Not implemented yet');
        exit();
    }

    if (APP_TYPE == '--node') {
        if (!TYPE || TYPE === '' || TYPE === '--help') {
            greenLog(
                `
            Usage: node tools/scripts/tools.mjs --create --node [type]
            [type]: the type of node app to create
            Options:
            --demo: prepend 'demo' and append '-node' to the app name
            `,
                true
            );
        }

        redLog('Not implemented yet');
        exit();
    }
}

if (OPTION === '--path') {
    const PROJECT_PATH = args[1];
    const COMMANDS = args.slice(2);

    if (!PROJECT_PATH || PROJECT_PATH === '' || PROJECT_PATH === '--help') {
        greenLog(
            `
        Usage: node tools/scripts/tools.mjs --path [project-path] [commands]
            [project-path]: the path of the project
            [commands]: the commands to run
    `,
            true
        );
        exit();
    }

    spawnCommand(COMMANDS[0], COMMANDS.slice(1), { cwd: PROJECT_PATH });
}

if (OPTION === '--test') {
    const TEST_TYPE = args[1];

    if (!TEST_TYPE || TEST_TYPE === '' || TEST_TYPE === '--help') {
        greenLog(
            `
        Usage: node tools/scripts/tools.mjs --test [test-type]
            [test-type]: the type of test to run
                --unit: run unit tests
                --e2e: run e2e tests
    `,
            true
        );
        exit();
    }

    if (TEST_TYPE === '--unit') {
        // spawnCommand('yarn', ['nx', 'run-many', '--target=test']);
        // await childRunCommand('yarn nx run-many --target=test');
        redLog(
            `
            To take advantage of nx colorful console messages, please run the following command to run unit tests:

            yarn nx run-many --target=test
        `,
            true
        );
    }

    if (TEST_TYPE === '--e2e') {
        const ENV = args[2];

        if (!ENV || ENV === '' || ENV === '--help') {
            greenLog(
                `
            Usage: node tools/scripts/tools.mjs --test --e2e [env]
                [env]: the environment to run the tests in
                    react: run tests on react app on port 4003
                    html: run tests on html app on port 4002
        `,
                true
            );
            exit();
        }

        if (ENV === 'react') {
            await childRunCommand(
                'cp tsconfig.base.json tsconfig.json && CYPRESS_REMOTE_DEBUGGING_PORT=9222 PORT=4003 yarn cypress open'
            );
        }

        if (ENV === 'html') {
            await childRunCommand(
                'cp tsconfig.base.json tsconfig.json && CYPRESS_REMOTE_DEBUGGING_PORT=9222 PORT=4002 yarn cypress open'
            );
        }
    }
}

if (OPTION === '--find') {
    const FIND_TYPE = args[1];

    if (!FIND_TYPE || FIND_TYPE === '' || FIND_TYPE === '--help') {
        greenLog(
            `
        Usage: node tools/scripts/tools.mjs --find [option]
            [option]: 
                --imports: find all imports from a directory
    `,
            true
        );
        exit();
    }

    if (FIND_TYPE === '--imports') {
        const TARGET_DIR = args[2];
        const FILTER = args[3];

        if (!TARGET_DIR || TARGET_DIR === '' || TARGET_DIR === '--help') {
            greenLog(
                `
            Usage: node tools/scripts/tools.mjs --find --imports [target-dir]
                [target-dir]: the directory to find imports from
        `,
                true
            );
            exit();
        }

        let res = await findImportsFromDir(TARGET_DIR);

        greenLog(
            `
            Usage: node tools/scripts/tools.mjs --find --imports [target-dir] --filter [keyword]
                [keyword]: the keyword to filter the results by
        `,
            true
        );

        if (FILTER === '--filter') {
            const keyword = args[4];

            res = res.filter((item) => item.includes(keyword));
        }

        console.log(res);
        exit();
    }
}

if (OPTION === '--build') {
    const BUILD_TYPE = args[1];

    if (!BUILD_TYPE || BUILD_TYPE === '' || BUILD_TYPE === '--help') {
        greenLog(
            `
        Usage: node tools/scripts/tools.mjs --build [option]
            [option]: the option to run
                --packages: build packages
                --target: build a target package
                --apps: build apps
                --all: build all
    `,
            true
        );

        exit();
    }

    if (BUILD_TYPE === '--target') {
        const TARGET = args[2];

        if (!TARGET || TARGET === '' || TARGET === '--help') {
            greenLog(
                `
            Usage: node tools/scripts/tools.mjs --build --target [target]
                [target]: the target to build
            `,
                true
            );
            exit();
        }

        spawnListener(`yarn nx run ${TARGET}:_buildTsc`);
        spawnListener(`yarn nx run ${TARGET}:_buildWeb`);
        spawnListener(`yarn postBuild:mapDistFolderNameToPackageJson`);
        spawnListener(`yarn tool:genHtml`);
        spawnListener(`yarn tool:genReact`);
        spawnListener(`yarn tool:genNodejs`);

    }

    if (BUILD_TYPE === '--packages') {

        const MODE = args[2];
        console.log("MODE:", MODE);

        if (!MODE || MODE === '' || MODE === '--help') {

            greenLog(
                `
            Usage: node tools/scripts/tools.mjs --build --packages [option]

                [option]: the option to run
                    --async: build packages in sequential
            `,
                true
            );
        }

        if (MODE === '--async') {

            await new Promise((resolve) => setTimeout(resolve, 1000));

            const packages = (await listDirsRecursive('./packages', false));
            let pkgNames = packages.map((item) => item.replace('packages/', ''));

            const orderJson = {};

            (await readJsonFile('./lit-build.config.json')).build.order.forEach((item, i) => {
                orderJson[item] = i;
            })

            pkgNames = customSort(pkgNames, orderJson);

            console.log(pkgNames);

            for (let i = 0; i < pkgNames.length; i++) {

                let name = pkgNames[i];

                if (i < (pkgNames.length - 1)) {
                    name = name + ' --skip';
                }

                await childRunCommand(`yarn build:target ${name}`);
            }

            exit();
        } else {
            const ignoreList = (await listDirsRecursive('./apps', false))
                .map((item) => item.replace('apps/', ''))
                .join(',');

            const command = `yarn nx run-many --target=build --exclude=${ignoreList}`;

            spawnListener(command, {
                onDone: () => {
                    console.log('Done!');
                    exit();
                },
            });

        }



        if (BUILD_TYPE === '--apps') {
            redLog('not implemented yet');
            // spawnListener('yarn build:apps', {
            //     onDone: () => {
            //         console.log("Done!");
            //     }
            // });
        }

        if (BUILD_TYPE === '--all') {
            redLog('not implemented yet');
            // spawnListener('yarn build:all', {
            //     onDone: () => {
            //         console.log("Done!");
            //     }
            // });
        }
    }
}

if (OPTION === '--publish') {
    let OPTION2 = args[1];

    if (!OPTION2 || OPTION2 === '' || OPTION2 === '--help') {
        greenLog(
            `
        Usage: node tools/scripts/tools.mjs --publish [option]
            [option]: the option to run
                --build: build packages before publishing
                --no-build: publish without building
                --tag: publish with a tag
                --target: publish a specific package
    `,
            true
        );

        exit();
    }

    if (OPTION2 === '--build') {
        spawnListener('yarn build:packages', {
            onDone: () => {
                spawnListener('yarn npx lerna publish --force-publish', {
                    onDone: () => {
                        console.log('Done!');
                    },
                });
            },
        });
    }

    if (OPTION2 === '--no-build') {
        spawnListener('yarn npx lerna publish --force-publish', {
            onDone: () => {
                console.log('Done!');
            },
        });
    }

    if (OPTION2 === '--tag') {

        const TAG = args[2];

        if (!TAG || TAG === '' || TAG === '--help') {
            greenLog(
                `
            Usage: node tools/scripts/tools.mjs --publish --tag [tag]
                [tag]: the tag to publish with
            `,
                true
            );
        }

        spawnListener(`yarn npx lerna publish --force-publish --dist-tag ${TAG}`, {
            onDone: async () => {
                const dirs = (await listDirsRecursive('./dist/packages', false)).filter((item) => item.includes('-vanilla'));

                await asyncForEach(dirs, async (dir) => {
                    await childRunCommand(`cd ${dir} && npm publish --tag ${TAG}`);
                })

                exit();
            },
        });
        // const dirs = (await listDirsRecursive('./dist/packages', false));

        // await asyncForEach(dirs, async (dir) => {
        //     await childRunCommand(`cd ${dir} && npm publish --tag ${TAG}`);
        // })

        // console.log(dirs);
    }

    if (OPTION2 === '--target') {
        const TARGET = args[2];

        if (!TARGET || TARGET === '' || TARGET === '--help') {
            greenLog(
                `
            Usage: node tools/scripts/tools.mjs --publish --target [target]
                [target]: the target to publish
            `,
                true
            );
        }

        await childRunCommand(`cd dist/packages/${TARGET} && npm publish --access public`);
        exit();
    }
}

if (OPTION === '--yalc') {
    const OPTION2 = args[1];

    if (!OPTION2 || OPTION2 === '' || OPTION2 === '--help') {
        greenLog(
            `
        Usage: node tools/scripts/tools.mjs --yalc [option]
            [option]: the option to run
                --publish: publish packages to yalc
                --push: push packages to yalc
                --remove: remove packages from yalc
    `,
            true
        );

        exit();
    }

    const dirs = (await listDirsRecursive('./dist/packages', false)).map((item) =>
        item.replace('dist/packages/', '')
    );

    if (OPTION2 === '--publish') {
        dirs.forEach((name) => {
            spawnCommand(
                'yalc',
                ['publish', '--push'],
                {
                    cwd: `dist/packages/${name}`,
                },
                { logExit: false }
            );
        });
    }

    if (OPTION2 === '--push') {
        dirs.forEach((name) => {
            spawnCommand(
                'yalc',
                ['push'],
                {
                    cwd: `dist/packages/${name}`,
                },
                { logExit: false }
            );
        });
    }

    if (OPTION2 === '--remove') {
        dirs.forEach((name) => {
            spawnCommand(
                'yalc',
                ['remove', name],
                {
                    cwd: `dist/packages/${name}`,
                },
                { logExit: false }
            );
        });
    }
    exit();
}

if (OPTION === '--switch') {
    const SCOPE = args[1];


    if (!SCOPE || SCOPE === '' || SCOPE === '--help') {
        greenLog(
            `
        Usage: node tools/scripts/tools.mjs --switch [scope]
            [scope]: the scope to switch
                --all: switch all packages
    `,
            true
        );

        exit();
    }

    if (SCOPE == '--all') {

        const FROM_NAME = args[2];
        const TO_NAME = args[3];

        if (!FROM_NAME || FROM_NAME === '' || FROM_NAME === '--help' || !TO_NAME || TO_NAME === '' || TO_NAME === '--help') {

            greenLog(
                `
            Usage: node tools/scripts/tools.mjs --switch --all [from] [to]
                [from]: the string to replace
                [to]: the string to replace with
        `,
                true
            );

            exit();
        }

        const dirs = await listDirsRecursive('./dist/packages', true);

        let paths = [];

        for (let i = 0; i < dirs.length; i++) {
            const dir = dirs[i];
            let _paths = await findStrFromDir(dir, FROM_NAME);
            paths.push(_paths);
        }

        // remove empty array
        paths = paths.filter((item) => item.length > 0);

        // flatten array
        paths = paths.flat();

        // for each file that contains the string, replace it
        for (let i = 0; i < paths.length; i++) {
            const file = paths[i];
            await replaceFileContent(paths[i], FROM_NAME, TO_NAME);
            greenLog(`Replaced ${FROM_NAME} with ${TO_NAME} in ${file}`);

            if (i === paths.length - 1) {
                console.log('Done!');
            }
        }

        exit();
    }
}

if (OPTION === '--clone') {

    const PROJECT_NAME = args[1];
    const NPM_NAME = args[2];

    greenLog(
        `
        Usage: node tools/scripts/tools.mjs --clone [project-name] [npm-name] [option]

            [project-name]: the name of the project
            [npm-name]: the npm name of the clone

            [option]: the option to run
                --publish: publish packages to npm
        `,
        true
    );

    if (!PROJECT_NAME || PROJECT_NAME === '' || PROJECT_NAME === '--help') {
        exit();
    } else {
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const dirs = (await listDirsRecursive('./dist/packages', false))
        .filter((item) => item.includes(PROJECT_NAME))
        .map((path) => {

            const name = path.replace('dist/packages/', '');

            const folderName = NPM_NAME.replaceAll('/', '-')
            let clonePath = path.replace(PROJECT_NAME, folderName);

            let npmName = clonePath.includes('-vanilla') ? `${NPM_NAME}-vanilla` : NPM_NAME;

            return {
                name,
                path,
                projectName: PROJECT_NAME,
                npmName,
                clonePath,
            }
        });


    // for loop clone a copy from path to clonePath
    for (let i = 0; i < dirs.length; i++) {

        greenLog(`Cloning ${dirs[i].name} to ${dirs[i].clonePath}`)

        const dir = dirs[i];

        await childRunCommand(`cp -r ${dir.path} ${dir.clonePath}`);

        // replace the name in package.json
        const packageJson = JSON.parse(await readFile(`${dir.clonePath}/package.json`));

        packageJson.name = dir.npmName;
        packageJson.publishConfig.directory = `../../dist/packages/${dir.npmName}`;

        // bump version
        // const version = packageJson.version.split('.');
        // version[2] = parseInt(version[2]) + 1;
        // packageJson.version = version.join('.');
        // packageJson.version = packageJson.version;

        await writeFile(`${dir.clonePath}/package.json`, JSON.stringify(packageJson, null, 4));
    };

    const OPTION2 = args[3];

    if (OPTION2 === '--publish') {

        // for loop publish each package
        for (let i = 0; i < dirs.length; i++) {
            const dir = dirs[i];

            await childRunCommand(`cd ${dir.clonePath} && npm publish --access public`);

        };

        // for loop to delete the clone
        for (let i = 0; i < dirs.length; i++) {
            const dir = dirs[i];

            // delete the clone 
            if (args[4] === '--remove') {
                await childRunCommand(`rm -rf ${dir.clonePath}`);
            }
        };
    }

    exit();

}

if (OPTION === '--dev') {

    const TYPE = args[1];

    if (!TYPE || TYPE === '' || TYPE === '--help') {
        greenLog(
            `
        Usage: node tools/scripts/tools.mjs --dev [type]
            [type]: the type of dev to run
                --apps: run dev on apps
    `,
            true
        );

        exit();
    }

    if (TYPE === '--apps' || TYPE === '--app') {

        // go to apps/react/project.json and find the port
        const reactPort = JSON.parse(await readFile('./apps/react/project.json')).targets.serve.options.port;
        const htmlPort = (await readFile('./apps/html/server.js')).match(/port: (\d+)/)[1];

        greenLog(`
            Running apps...
            html: http://localhost:${htmlPort}
            react: http://localhost:${reactPort}
            nodejs: in this terminal
        `, true);

        // wait for 2 seconds before running the apps
        setTimeout(() => {
            spawnListener('yarn nx run nodejs:serve', {}, '[nodejs]', 31);
            spawnListener('yarn nx run react:serve', {}, '[react]', 32);
            spawnListener('yarn nx run html:serve', {}, '[html]', 33);
        }, 2000);
    }
}

if (OPTION === '--watch') {
    const OPTION = args[1];

    if (!OPTION || OPTION === '' || OPTION === '--help') {

        greenLog(`
            Usage: node tools/scripts/tools.mjs --watch [option]
                [option]: the option to use
                    --all: watch all
                    --target: watch a target
        `, true);

        exit();
    }

    if (OPTION === '--all') {
        greenLog('Watching all...', true);
        await childRunCommand('nodemon --watch packages --ext js,ts --exec "yarn tools --build --packages --async"');
    }

    if (OPTION === '--target') {

        const TARGET = args[2];

        greenLog(`
            Usage: node tools/scripts/tools.mjs --watch --target [target] [option]
                [target]: the target to watch
                [option]: the option to use
                    --deps: with dependencies
        `, true);

        if (!TARGET || TARGET === '' || TARGET === '--help') {
            exit()
        } else {
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        // check if directory exists
        const path = `./packages/${TARGET}`;
        if (!fs.existsSync(path)) {
            redLog(`Target "${TARGET}" does not exist!`);
            exit();
        }

        if (args[3] === '--deps') {
            const projectNameSpace = (await readFile(`package.json`)).match(/"name": "(.*)"/)[1].split('/')[0];
            let res = (await findImportsFromDir(`${path}/src`)).filter((item) => item.includes(projectNameSpace)).map((item) => {
                return item.replace(projectNameSpace, '').replace('/', '');
            });

            res.forEach((pkg) => {
                greenLog(`Watching ${pkg}...`, true);
                childRunCommand(`nodemon --watch ${pkg} --ext js,ts --exec "yarn tools --build --target ${pkg}"`);
            });

        } else {
            greenLog(`Watching ${TARGET}...`, true);
            await new Promise((resolve) => setTimeout(resolve, 500));
            childRunCommand(`nodemon --watch packages/${TARGET} --ext js,ts --exec "yarn tools --build --target ${TARGET}"`);
        }
    }

}
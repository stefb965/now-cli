#!/usr/bin/env node

// Packages
const fs = require('fs-promise');
const minimist = require('minimist');
const chalk = require('chalk');
const table = require('text-table');
const ms = require('ms');

// Ours
const strlen = require('../lib/strlen');
const indent = require('../lib/indent');
const Now = require('../lib');
const login = require('../lib/login');
const cfg = require('../lib/cfg');
const { handleError, error } = require('../lib/error');
const logo = require('../lib/utils/output/logo');

const argv = minimist(process.argv.slice(2), {
  string: ['config', 'token'],
  boolean: ['help', 'debug'],
  alias: {
    help: 'h',
    config: 'c',
    debug: 'd',
    token: 't'
  }
});

const help = () => {
  console.log(
    `
  ${chalk.bold(`${logo} now list`)} [app]

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline('FILE')}  Config file
    -d, --debug             Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline('TOKEN')} Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} List all deployments

    ${chalk.cyan('$ now ls')}

  ${chalk.gray('–')} List all deployments for the app ${chalk.dim('`my-app`')}

    ${chalk.cyan('$ now ls my-app')}

  ${chalk.dim('Alias:')} ls
`
  );
};

if (argv.help) {
  help();
  process.exit(0);
}

const app = argv._[0];

// Options
const debug = argv.debug;
const apiUrl = argv.url || 'https://api.zeit.co';

if (argv.config) {
  cfg.setConfigFile(argv.config);
}

const config = cfg.read();

Promise.resolve(argv.token || config.token || login(apiUrl))
  .then(async token => {
    try {
      await list(token);
    } catch (err) {
      error(`Unknown error: ${err}\n${err.stack}`);
      process.exit(1);
    }
  })
  .catch(e => {
    error(`Authentication error – ${e.message}`);
    process.exit(1);
  });

async function list(token) {
  const now = new Now(apiUrl, token, { debug });
  const start = new Date();

  let deployments;
  try {
    deployments = await now.list(app);
  } catch (err) {
    handleError(err);
    process.exit(1);
  }

  now.close();

  const apps = new Map();

  for (const dep of deployments) {
    const deps = apps.get(dep.name) || [];
    apps.set(dep.name, deps.concat(dep));
  }

  const sorted = await sort([...apps]);
  const current = Date.now();

  const text = sorted
    .map(([name, deps]) => {
      const t = table(
        deps.map(({ uid, url, created }) => {
          const _url = url ? chalk.underline(`https://${url}`) : 'incomplete';
          const time = chalk.gray(ms(current - created) + ' ago');
          return [uid, _url, time];
        }),
        { align: ['l', 'r', 'l'], hsep: ' '.repeat(6), stringLength: strlen }
      );
      return chalk.bold(name) + '\n\n' + indent(t, 2);
    })
    .join('\n\n');

  const elapsed = ms(new Date() - start);
  console.log(
    `> ${deployments.length} deployment${deployments.length === 1 ? '' : 's'} found ${chalk.gray(`[${elapsed}]`)}`
  );

  if (text) {
    console.log('\n' + text + '\n');
  }
}

async function sort(apps) {
  let pkg;
  try {
    const json = await fs.readFile('package.json');
    pkg = JSON.parse(json);
  } catch (err) {
    pkg = {};
  }

  return apps
    .map(([name, deps]) => {
      deps = deps.slice().sort((a, b) => {
        return b.created - a.created;
      });
      return [name, deps];
    })
    .sort(([nameA, depsA], [nameB, depsB]) => {
      if (pkg.name === nameA) {
        return -1;
      }

      if (pkg.name === nameB) {
        return 1;
      }

      return depsB[0].created - depsA[0].created;
    });
}

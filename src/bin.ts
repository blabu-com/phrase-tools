#!/usr/bin/env node

import yargs from 'yargs'

import prune from './prune'

// tslint:disable-next-line:no-unused-expression
yargs
  // tslint:disable-next-line:no-any
  .command('prune', 'Prunes translations by deleting unused keys', {}, async (argv: any) => {
    await prune(argv)
  })
  .option('dry-run', {
    type: 'boolean',
    description: 'Do not apply changes',
    default: true
  })
  .help()
  .version('0.1.0')
  .strict().argv

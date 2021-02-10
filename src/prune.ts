#!/usr/bin/env node
import fs from 'fs'
import yaml from 'js-yaml'

import Push from './Push'
import { Arguments, Config } from './types'

const prune = async ({ dryRun }: Arguments) => {
  const config = yaml.load(fs.readFileSync('.phrase.yml', 'utf-8')) as Config
  const push = new Push(config)
  await push.readResources()
  await push.pruneRemoteResources(dryRun)

  return 0
}

export default prune

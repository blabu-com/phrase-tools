export type Arguments = {
  dryRun: boolean
}

export type Config = {
  phrase: {
    access_token: string
    project_id: string
    push: {
      sources: {
        file: string
        params: {
          locale_id: string
          file_format: string
          tags: string
        }
      }[]
    }
  }
}

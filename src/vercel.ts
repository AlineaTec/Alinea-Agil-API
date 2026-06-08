/**
 * Entry serverless para Vercel. El proyecto debe usar Root Directory = carpeta `api`
 * y `vercel.json` con rewrite hacia esta función.
 */
import "dotenv/config"

import type { Express, Request, Response } from "express"
import { prepareHttpApplication } from "./prepare-http-application.js"
import { initApiSentry } from "./sentry-config.js"

initApiSentry()

let appPromise: Promise<Express> | null = null

function getExpressApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = prepareHttpApplication().then(({ app }) => app)
  }
  return appPromise
}

export default async function vercelHandler(req: Request, res: Response): Promise<void> {
  const app = await getExpressApp()

  await new Promise<void>((resolve, reject) => {
    const done = (): void => {
      resolve()
    }
    res.once("finish", done)
    res.once("close", done)
    res.once("error", reject)
    try {
      app(req, res)
    } catch (err) {
      reject(err)
    }
  })
}

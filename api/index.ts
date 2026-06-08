/**
 * Función serverless de Vercel. Tras `npm run build`, importa el handler compilado.
 * Root Directory del proyecto en Vercel: carpeta `api` (este repo).
 */
import vercelHandler from "../dist/vercel.js"

export default vercelHandler

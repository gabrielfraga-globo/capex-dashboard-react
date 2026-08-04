import type { RelatorioParsing } from "../types";
import { parseWorkbookBuffer } from "./excelProcessingCore";

export {
  createParseWorkbookDiagnostics,
  normalizeKey,
  parseWorkbookBuffer,
  parseWorkbookBufferPhased,
} from "./excelProcessingCore";

export type { ParseWorkbookDiagnostics, SheetDiagKey } from "./excelProcessingCore";

export async function parseExcelFile(file: File): Promise<RelatorioParsing> {
  const buf = await file.arrayBuffer();
  return parseWorkbookBuffer(buf, file.name);
}

import { parseCadBuffer } from '@/lib/cadWorkerClient';
import type {
  CadImportWorkerRequest,
  CadImportWorkerResponse,
} from '@/types/cadReference';

// Handle messages from the main thread in Web Worker
self.onmessage = async (event: MessageEvent<CadImportWorkerRequest>) => {
  const { id, fileName, fileBuffer, fileType } = event.data;

  try {
    const result = await parseCadBuffer(fileBuffer, fileName, fileType);

    const transferables: Transferable[] = [
      result.positions.buffer,
      result.normals.buffer,
    ];
    if (result.metadata.tessellatedStlBytes) {
      transferables.push(result.metadata.tessellatedStlBytes.buffer);
    }

    const response: CadImportWorkerResponse = {
      id,
      success: true,
      result,
    };

    (self as unknown as Worker).postMessage(response, transferables);
  } catch (error) {
    const response: CadImportWorkerResponse = {
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };

    self.postMessage(response);
  }
};

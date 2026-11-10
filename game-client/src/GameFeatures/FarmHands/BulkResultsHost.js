import React, { useEffect, useState } from 'react';
import { useStrings } from '../../UI/StringsContext';
import BulkHarvestResultsModal from './BulkHarvestResultsModal';
import BulkCraftingResultsModal from './BulkCraftingResultsModal';

/**
 * The Bulk Harvest / Bulk Crafting results modals, mounted once at the app root (index.js) so they
 * outlive the worker's panel (owner 2026-11-10): the panel closes the moment a bulk run succeeds and
 * its results show over the board. FarmHand.js calls showBulkResults('harvest' | 'crafting', ...).
 */
let showRequest = null;

/** kind: 'harvest' | 'crafting'; results: the execute*() answer; masterResources: the master table */
export function showBulkResults(kind, results, masterResources) {
  showRequest?.({ kind, results, masterResources });
}

export function BulkResultsHost() {
  const strings = useStrings();
  const [request, setRequest] = useState(null);

  useEffect(() => {
    showRequest = (next) => setRequest(next);
    return () => { showRequest = null; };
  }, []);

  if (!request) return null;
  const Modal = request.kind === 'crafting' ? BulkCraftingResultsModal : BulkHarvestResultsModal;
  return (
    <Modal
      isOpen
      onClose={() => setRequest(null)}
      results={request.results}
      strings={strings}
      masterResources={request.masterResources}
    />
  );
}

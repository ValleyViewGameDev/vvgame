import React from 'react';
import Modal from './Modal';
import { useStrings } from '../StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { describeResourceSource } from '../../Utils/resourceSource';
import './ResourceModalSmall.css';

/**
 * ResourceModalSmall: the icon, the name and "where it comes from" for one resource.
 *
 * Open it when a player taps a resource icon that has no other action of its own: an
 * offer they cannot afford (Kent, Train, Carnival), a requirement list, a reward preview.
 * Usage: keep `const [infoResource, setInfoResource] = useState(null)` in the panel, set it
 * to a resource type on tap, and render
 *   {infoResource && <ResourceModalSmall resourceType={infoResource} masterResources={masterResources} onClose={() => setInfoResource(null)} />}
 */
export default function ResourceModalSmall({ resourceType, masterResources, onClose }) {
  const strings = useStrings();
  const resource = (masterResources || []).find((r) => r.type === resourceType);
  const { line, ingredients } = describeResourceSource(resourceType, masterResources, strings);
  const name = getLocalizedString(resourceType, strings);

  return (
    <Modal size="small" className="resource-modal-small" onClose={onClose} title={name}>
      <div className="rms-icon" aria-hidden="true">
        {resource?.filename
          ? <img src={`/assets/resources/${resource.filename}`} alt="" />
          : <span>{resource?.symbol || '❓'}</span>}
      </div>
      {line && <p className="rms-source">{line}</p>}
      {ingredients && <p className="rms-ingredients"><span className="rms-label">{strings[17008]}</span> {ingredients}</p>}
    </Modal>
  );
}

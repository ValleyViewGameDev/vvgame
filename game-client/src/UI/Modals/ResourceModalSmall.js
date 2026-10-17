import React from 'react';
import Modal from './Modal';
import { useStrings } from '../StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { describeResourceSource } from '../../Utils/resourceSource';
import './ResourceModalSmall.css';

/**
 * ResourceModalSmall: the icon, the name and "where it comes from" for one resource, or for
 * several side by side (a multi-item Kent offer).
 *
 * Open it when a player taps a resource icon that has no other action of its own: an
 * offer they cannot afford (Kent, Train, Carnival), a requirement list, a reward preview.
 * Usage: keep `const [infoResource, setInfoResource] = useState(null)` in the panel, set it
 * to a resource type on tap, and render
 *   {infoResource && <ResourceModalSmall resourceType={infoResource} masterResources={masterResources} onClose={() => setInfoResource(null)} />}
 * `resourceType` may be an array of types: each gets its own column, smaller, under one title.
 * `needs` (optional, [{ type, need, have }]) adds a "need / have" count under each name (Kent's
 * card order), green when held, red when short.
 */
function ResourceColumn({ type, masterResources, strings, need, compact }) {
  const resource = (masterResources || []).find((r) => r.type === type);
  const { line, ingredients } = describeResourceSource(type, masterResources, strings);
  return (
    <div className="rms-col">
      <div className="rms-icon" aria-hidden="true">
        {resource?.filename
          ? <img src={`/assets/resources/${resource.filename}`} alt="" />
          : <span>{resource?.symbol || '❓'}</span>}
      </div>
      {compact && <div className="rms-name">{getLocalizedString(type, strings)}</div>}
      {need && (
        <div className={`rms-count ${need.have >= need.need ? 'ok' : 'short'}`}>
          {/* need / have, the order Kent's cards print it */}
          {Number(need.need).toLocaleString()} / {Number(need.have).toLocaleString()}
        </div>
      )}
      {line && <p className="rms-source">{line}</p>}
      {ingredients && <p className="rms-ingredients"><span className="rms-label">{strings[17008]}</span> {ingredients}</p>}
    </div>
  );
}

export default function ResourceModalSmall({ resourceType, masterResources, onClose, needs }) {
  const strings = useStrings();
  const types = Array.isArray(resourceType) ? resourceType : [resourceType];
  const multi = types.length > 1;
  const needFor = (type) => (needs || []).find((n) => n.type === type);
  const title = multi ? (strings[2059] || 'What this order needs') : getLocalizedString(types[0], strings);

  return (
    <Modal size={multi ? 'narrow' : 'small'} className={`resource-modal-small ${multi ? 'rms-multi' : ''}`} onClose={onClose} title={title}>
      <div className="rms-cols" style={multi ? { gridTemplateColumns: `repeat(${Math.min(types.length, 3)}, minmax(0, 1fr))` } : undefined}>
        {types.map((type) => (
          <ResourceColumn key={type} type={type} masterResources={masterResources} strings={strings} need={needFor(type)} compact={multi} />
        ))}
      </div>
    </Modal>
  );
}

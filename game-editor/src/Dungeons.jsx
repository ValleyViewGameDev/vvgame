import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import API_BASE from './config';
import './Dungeons.css';
import '../../game-client/src/UI/Styles/theme.css';
import '../../game-client/src/UI/Buttons/SharedButtons.css';

const fs = window.require('fs');
const path = window.require('path');
const app = window.require('@electron/remote').app;
const isDev = !app.isPackaged;
const projectRoot = isDev
  ? path.join(__dirname, '..', '..')
  : path.join(app.getAppPath(), '..', '..', '..', '..', '..', '..', '..');

// Decode the SSGG part of a TTFFSSGG gridCoord into settlement row/col + grid row/col
const decodeGridCoord = (coord) => {
  const ssgg = Number(coord) % 10000;
  return {
    sRow: Math.floor(ssgg / 1000),
    sCol: Math.floor(ssgg / 100) % 10,
    gRow: Math.floor(ssgg / 10) % 10,
    gCol: ssgg % 10,
  };
};

const isGridCoord = (value) => Number.isFinite(Number(value)) && String(value).trim() !== '';

const formatGridCoord = (coord) => {
  if (!isGridCoord(coord)) return `${coord} (legacy grid id)`;
  const { sRow, sCol, gRow, gCol } = decodeGridCoord(coord);
  return `${coord} (S${sRow},${sCol} G${gRow},${gCol})`;
};

const Dungeons = ({ selectedFrontier, settlements = [], activePanel }) => {
  const [dungeonGrids, setDungeonGrids] = useState([]);
  const [dungeonData, setDungeonData] = useState({}); // Frontier dungeon data
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingDungeon, setEditingDungeon] = useState({}); // Track which dungeons are being edited
  const [newEntranceCoordInput, setNewEntranceCoordInput] = useState({}); // Per-dungeon selected gridCoord to add

  // Town/valley cells in the selected frontier that have a template instance (Settlement.grids[].gridId).
  // Entrances are keyed by gridCoord; the template gridId is only used to validate the Dungeon Entrance resource.
  const entranceCells = useMemo(() => {
    const cells = [];
    for (const settlement of settlements) {
      const fid = settlement.frontierId?._id || settlement.frontierId;
      if (String(fid) !== String(selectedFrontier)) continue;
      const grids = Array.isArray(settlement.grids) ? settlement.grids.flat() : [];
      for (const cell of grids) {
        if (!cell?.gridId || !isGridCoord(cell.gridCoord)) continue;
        if (cell.gridType === 'homestead') continue;
        cells.push({
          gridCoord: Number(cell.gridCoord),
          gridId: String(cell.gridId?._id || cell.gridId),
          gridType: cell.gridType,
        });
      }
    }
    return cells.sort((a, b) => a.gridCoord - b.gridCoord);
  }, [settlements, selectedFrontier]);

  const entranceCellByCoord = useMemo(
    () => new Map(entranceCells.map(cell => [cell.gridCoord, cell])),
    [entranceCells]
  );

  // Load dungeon grids when panel becomes active
  useEffect(() => {
    if (activePanel === 'dungeons' && selectedFrontier) {
      loadDungeonGrids();
      loadDungeonData();
      loadTemplates();
    }
  }, [activePanel, selectedFrontier]);

  const loadDungeonGrids = async () => {
    try {
      // Template instances only (never per-player copies)
      const response = await axios.get(`${API_BASE}/api/grids`, {
        params: {
          gridType: 'dungeon',
          isTemplate: true
        }
      });
      // Sort by creation date (newest first)
      setDungeonGrids(response.data.sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt);
      }));
    } catch (error) {
      console.error('Error loading dungeon grids:', error);
      setError('Failed to load dungeon grids');
    }
  };

  const loadDungeonData = async () => {
    if (!selectedFrontier) return;
    
    try {
      const response = await axios.get(`${API_BASE}/api/get-frontier/${selectedFrontier}`);
      if (response.data.dungeons) {
        // Convert Map to object for easier access
        const dungeonMap = {};
        Object.entries(response.data.dungeons).forEach(([key, value]) => {
          dungeonMap[key] = value;
          // Initialize editing state for this dungeon
          setEditingDungeon(prev => ({
            ...prev,
            [key]: {
              templateUsed: value.templateUsed,
              // Frontier.dungeons[*].entranceGrids now holds gridCoords (numbers)
              entranceGridCoords: (value.entranceGrids || []).map(v => (isGridCoord(v) ? Number(v) : v)),
              hasChanges: false
            }
          }));
        });
        setDungeonData(dungeonMap);
      }
    } catch (error) {
      console.error('Error loading dungeon data from frontier:', error);
    }
  };

  const loadTemplates = () => {
    try {
      // Load dungeon templates directly from filesystem
      const dungeonTemplatesDir = path.join(projectRoot, 'game-server', 'layouts', 'gridLayouts', 'dungeon');
      
      if (!fs.existsSync(dungeonTemplatesDir)) {
        console.warn('⚠️ Dungeon templates directory not found:', dungeonTemplatesDir);
        setTemplates([]);
        return;
      }
      
      const templateFiles = fs.readdirSync(dungeonTemplatesDir).filter(file => file.endsWith('.json'));
      const loadedTemplates = templateFiles.map(file => ({
        filename: file.replace('.json', ''),
        displayName: file.replace('.json', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      }));
      
      setTemplates(loadedTemplates);
      console.log('✅ Loaded dungeon templates:', loadedTemplates);
      
      if (loadedTemplates.length > 0) {
        setSelectedTemplate(loadedTemplates[0].filename);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      setError('Failed to load dungeon templates');
    }
  };

  const createDungeonGrid = async () => {
    if (!selectedTemplate) {
      setError('Please select a template');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_BASE}/api/create-dungeon`, {
        templateFilename: selectedTemplate,
        settlementId: selectedFrontier || 'global',
        frontierId: selectedFrontier || 'global'
      });

      console.log('Created dungeon grid:', response.data);
      
      // Refresh the list
      await loadDungeonGrids();
      
      // Success message
      alert(`Dungeon grid created successfully!`);
      
    } catch (error) {
      console.error('Error creating dungeon grid:', error);
      setError(error.response?.data?.error || 'Failed to create dungeon grid');
    } finally {
      setLoading(false);
    }
  };

  const deleteDungeonGrid = async (gridId) => {
    if (!window.confirm(`Are you sure you want to delete dungeon grid "${gridId}"? This cannot be undone.`)) {
      return;
    }

    setLoading(true);
    try {
      await axios.delete(`${API_BASE}/api/delete-dungeon/${gridId}`);
      console.log(`Deleted dungeon grid: ${gridId}`);
      
      // Refresh the list
      await loadDungeonGrids();
      
    } catch (error) {
      console.error('Error deleting dungeon grid:', error);
      setError(error.response?.data?.error || 'Failed to delete dungeon grid');
    } finally {
      setLoading(false);
    }
  };

  const resetDungeonGrid = async (dungeon) => {
    if (!window.confirm(`Are you sure you want to reset dungeon grid "${dungeon.gridId}"? This will reset all resources and NPCs using the template stored in dungeonLog.`)) {
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_BASE}/api/reset-dungeon`, {
        gridId: dungeon._id
      });
      console.log(`Reset dungeon grid: ${dungeon.gridId}`);
      
      alert(`Dungeon grid reset successfully!`);
      
    } catch (error) {
      console.error('Error resetting dungeon grid:', error);
      setError(error.response?.data?.error || 'Failed to reset dungeon grid');
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateChange = (dungeonId, newTemplate) => {
    setEditingDungeon(prev => ({
      ...prev,
      [dungeonId]: {
        ...prev[dungeonId],
        templateUsed: newTemplate,
        hasChanges: true
      }
    }));
  };

  const handleEntranceCoordAdd = async (dungeonId, coordRaw) => {
    if (!isGridCoord(coordRaw)) return;
    const gridCoord = Number(coordRaw);

    const cell = entranceCellByCoord.get(gridCoord);
    if (!cell) {
      alert(`gridCoord ${gridCoord} is not a created town/valley cell in this frontier`);
      return;
    }

    // Validate against the cell's template instance (Settlement.grids[].gridId)
    try {
      const response = await axios.get(`${API_BASE}/api/grid-has-resource`, {
        params: {
          gridId: cell.gridId,
          resourceType: 'Dungeon Entrance'
        }
      });

      if (!response.data.hasResource) {
        alert(`Cell ${formatGridCoord(gridCoord)} does not have a Dungeon Entrance resource`);
        return;
      }
    } catch (error) {
      console.error('Error validating entrance cell:', error);
      alert('Failed to validate entrance cell');
      return;
    }

    setEditingDungeon(prev => {
      const current = prev[dungeonId]?.entranceGridCoords || [];
      if (current.includes(gridCoord)) {
        alert('This cell is already linked to this dungeon');
        return prev;
      }

      return {
        ...prev,
        [dungeonId]: {
          ...prev[dungeonId],
          entranceGridCoords: [...current, gridCoord],
          hasChanges: true
        }
      };
    });
  };

  const handleEntranceCoordRemove = (dungeonId, gridCoord) => {
    setEditingDungeon(prev => ({
      ...prev,
      [dungeonId]: {
        ...prev[dungeonId],
        entranceGridCoords: (prev[dungeonId]?.entranceGridCoords || []).filter(c => c !== gridCoord),
        hasChanges: true
      }
    }));
  };

  const saveDungeonChanges = async (dungeonId) => {
    const editing = editingDungeon[dungeonId];
    if (!editing || !editing.hasChanges) return;
    
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/api/update-dungeon-config`, {
        frontierId: selectedFrontier,
        dungeonGridId: dungeonId,
        templateUsed: editing.templateUsed,
        // gridCoords (numbers); any legacy non-numeric ids are dropped on save
        entranceGridCoords: (editing.entranceGridCoords || []).filter(isGridCoord).map(Number)
      });
      
      // Refresh data
      await loadDungeonData();
      
      // Reset editing state for this dungeon
      setEditingDungeon(prev => ({
        ...prev,
        [dungeonId]: {
          ...prev[dungeonId],
          hasChanges: false
        }
      }));
      
      alert('Dungeon configuration saved successfully!');
    } catch (error) {
      console.error('Error saving dungeon configuration:', error);
      setError(error.response?.data?.error || 'Failed to save dungeon configuration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dungeons-container">
      <h2>Dungeon Grid Management</h2>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* Create New Dungeon */}
      <div className="create-dungeon-section">
        <h3>Create New Dungeon Grid</h3>
        
        <div className="form-row">
          <label>
            Template:
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              disabled={loading}
            >
              <option value="">-- Select Template --</option>
              {templates.map(template => (
                <option key={template.filename} value={template.filename}>
                  {template.displayName || template.filename}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="shared-buttons">
          <button
            onClick={createDungeonGrid}
            disabled={loading || !selectedTemplate}
            className="btn-basic btn-mini"
          >
            {loading ? 'Creating...' : 'Create Dungeon Grid'}
          </button>
        </div>
      </div>

      {/* Existing Dungeons List */}
      <div className="dungeons-list-section">
        <h3>Existing Dungeon Grids ({dungeonGrids.length})</h3>
        
        {dungeonGrids.length === 0 ? (
          <p className="no-dungeons">No dungeon grids created yet.</p>
        ) : (
          <table className="dungeons-table">
            <thead>
              <tr>
                <th style={{width: '120px'}}>Grid ID</th>
                <th style={{width: '150px'}}>Template</th>
                <th style={{width: '220px'}}>Entrance Cells (gridCoord)</th>
                <th style={{width: '240px'}}>Add Entrance Cell</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {dungeonGrids.map(dungeon => {
                const dungeonId = dungeon._id;
                const frontierData = dungeonData[dungeonId] || {};
                const editing = editingDungeon[dungeonId] || {};
                const entranceGridCoords = editing.entranceGridCoords
                  || (frontierData.entranceGrids || []).map(v => (isGridCoord(v) ? Number(v) : v));
                const addableCells = entranceCells.filter(cell => !entranceGridCoords.includes(cell.gridCoord));
                
                return (
                  <tr key={dungeonId}>
                    <td className="grid-id-cell">{dungeon.gridId}</td>
                    <td className="template-cell">
                      <select
                        value={editing.templateUsed || frontierData.templateUsed || dungeon.templateUsed || ''}
                        onChange={(e) => handleTemplateChange(dungeonId, e.target.value)}
                        disabled={loading}
                        className="template-select"
                      >
                        <option value="">-- Select --</option>
                        {templates.map(template => (
                          <option key={template.filename} value={template.filename}>
                            {template.filename}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="source-grids-cell">
                      <div className="source-grids-list">
                        {entranceGridCoords.length === 0 ? (
                          <span className="no-sources">None</span>
                        ) : (
                          entranceGridCoords.map((gridCoord, index) => (
                            <div key={index} className="source-grid-item">
                              <span>{formatGridCoord(gridCoord)}</span>
                              <button
                                onClick={() => handleEntranceCoordRemove(dungeonId, gridCoord)}
                                className="remove-button-mini"
                                title={`Remove ${gridCoord}`}
                              >
                                ×
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="add-grid-cell">
                      <div className="add-grid-container">
                        <select
                          value={newEntranceCoordInput[dungeonId] || ''}
                          onChange={(e) => setNewEntranceCoordInput(prev => ({
                            ...prev,
                            [dungeonId]: e.target.value
                          }))}
                          className="add-grid-input"
                          disabled={loading}
                        >
                          <option value="">
                            {addableCells.length === 0 ? '-- No created town/valley cells --' : '-- Select cell --'}
                          </option>
                          {addableCells.map(cell => (
                            <option key={cell.gridCoord} value={cell.gridCoord}>
                              {formatGridCoord(cell.gridCoord)} {cell.gridType}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            handleEntranceCoordAdd(dungeonId, newEntranceCoordInput[dungeonId]);
                            setNewEntranceCoordInput(prev => ({
                              ...prev,
                              [dungeonId]: ''
                            }));
                          }}
                          className="add-grid-button"
                          disabled={loading || !newEntranceCoordInput[dungeonId]}
                        >
                          Add
                        </button>
                      </div>
                    </td>
                    <td className="actions">
                      {editing.hasChanges && (
                        <button
                          onClick={() => saveDungeonChanges(dungeonId)}
                          className="action-button save"
                          disabled={loading}
                          title="Save Changes"
                        >
                          💾
                        </button>
                      )}
                      <button
                        onClick={() => resetDungeonGrid(dungeon)}
                        className="action-button edit"
                        title="Reset Grid with Template"
                      >
                        🔄
                      </button>
                      <button
                        onClick={() => deleteDungeonGrid(dungeonId)}
                        className="action-button delete"
                        disabled={loading}
                        title="Delete Dungeon"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Template Info */}
      <div className="template-info-section">
        <h3>Dungeon Templates</h3>
        <p>To create new dungeon templates, use the Grid Editor to design a template and save it with a descriptive name.</p>
        <p>Templates are located in the game-server/layouts/gridLayouts/dungeon/ directory.</p>
      </div>
    </div>
  );
};

export default Dungeons;
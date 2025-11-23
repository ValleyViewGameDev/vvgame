import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE from './config';
import { useFileContext } from './FileContext';
import './Dungeons.css';

const fs = window.require('fs');
const path = window.require('path');
const app = window.require('@electron/remote').app;
const isDev = !app.isPackaged;
const projectRoot = isDev
  ? path.join(__dirname, '..', '..')
  : path.join(app.getAppPath(), '..', '..', '..', '..', '..', '..', '..');

const Dungeons = ({ selectedFrontier, activePanel }) => {
  const { setFileName, setDirectory } = useFileContext();
  const [dungeonGrids, setDungeonGrids] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [newGridName, setNewGridName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load dungeon grids when panel becomes active
  useEffect(() => {
    if (activePanel === 'dungeons') {
      loadDungeonGrids();
      loadTemplates();
    }
  }, [activePanel]);

  const loadDungeonGrids = async () => {
    try {
      // Use the standard grids endpoint with a filter
      const response = await axios.get(`${API_BASE}/api/grids`, {
        params: {
          gridType: 'dungeon'
        }
      });
      setDungeonGrids(response.data.sort((a, b) => {
        // Sort by gridCoord.y then gridCoord.x (both negative, so higher absolute value = newer)
        if (a.gridCoord.y !== b.gridCoord.y) return a.gridCoord.y - b.gridCoord.y;
        return a.gridCoord.x - b.gridCoord.x;
      }));
    } catch (error) {
      console.error('Error loading dungeon grids:', error);
      setError('Failed to load dungeon grids');
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

  const getNextDungeonCoord = () => {
    // Find the lowest (most negative) coordinates used
    if (dungeonGrids.length === 0) {
      return { x: -10000, y: -10000 };
    }
    
    // Get the most negative coordinates
    const lowestX = Math.min(...dungeonGrids.map(g => g.gridCoord.x));
    const lowestY = Math.min(...dungeonGrids.map(g => g.gridCoord.y));
    
    // Return next sequential position
    return { x: lowestX - 1, y: lowestY - 1 };
  };

  const createDungeonGrid = async () => {
    if (!selectedTemplate) {
      setError('Please select a template');
      return;
    }

    if (!newGridName.trim()) {
      setError('Please enter a grid name');
      return;
    }

    // Validate grid name format
    if (!/^dungeon_[a-z0-9_]+$/.test(newGridName)) {
      setError('Grid name must start with "dungeon_" and contain only lowercase letters, numbers, and underscores');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const nextCoord = getNextDungeonCoord();
      
      const response = await axios.post(`${API_BASE}/api/create-dungeon`, {
        gridCoord: nextCoord,
        gridId: newGridName,
        templateFilename: selectedTemplate,
        settlementId: selectedFrontier || 'global',
        frontierId: selectedFrontier || 'global'
      });

      console.log('Created dungeon grid:', response.data);
      
      // Refresh the list
      await loadDungeonGrids();
      
      // Clear the form
      setNewGridName('');
      
      // Success message
      alert(`Dungeon grid "${newGridName}" created successfully!`);
      
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

  const openInEditor = (dungeon) => {
    // Use the template that was used to create this dungeon
    const templateName = dungeon.templateUsed || dungeon.gridId;
    
    // Set the file context for the editor
    setFileName(templateName);
    setDirectory('dungeon/');
    
    // Switch to grid editor and load the dungeon template
    window.dispatchEvent(new CustomEvent('switch-to-editor'));
    window.dispatchEvent(new CustomEvent('editor-load-grid', { 
      detail: { 
        gridId: dungeon.gridId,
        gridType: 'dungeon',
        directory: 'dungeon/',
        fileName: templateName
      } 
    }));
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
            Grid Name:
            <input
              type="text"
              value={newGridName}
              onChange={(e) => setNewGridName(e.target.value)}
              placeholder="dungeon_crypt_1"
              pattern="^dungeon_[a-z0-9_]+$"
              disabled={loading}
            />
            <small>Must start with "dungeon_" (e.g., dungeon_crypt_1)</small>
          </label>
        </div>
        
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

        <button
          onClick={createDungeonGrid}
          disabled={loading || !selectedTemplate || !newGridName}
          className="create-button"
        >
          {loading ? 'Creating...' : 'Create Dungeon Grid'}
        </button>
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
                <th>Grid ID</th>
                <th>Template</th>
                <th>Coordinates</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {dungeonGrids.map(dungeon => (
                <tr key={dungeon._id}>
                  <td>{dungeon.gridId}</td>
                  <td>{dungeon.templateUsed || 'Unknown'}</td>
                  <td>({dungeon.gridCoord.x}, {dungeon.gridCoord.y})</td>
                  <td>{new Date(dungeon.createdAt).toLocaleDateString()}</td>
                  <td className="actions">
                    <button
                      onClick={() => openInEditor(dungeon)}
                      className="action-button edit"
                      title="Edit in Grid Editor"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => deleteDungeonGrid(dungeon._id)}
                      className="action-button delete"
                      disabled={loading}
                      title="Delete Dungeon"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
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
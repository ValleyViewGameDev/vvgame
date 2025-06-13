import React from 'react';
import './App.css'; // ✅ Ensure styles are managed in a separate file
import { useFileContext } from './FileContext';

const FileManager = ({ loadLayout, saveLayout }) => {
  const { fileName, setFileName, directory, setDirectory } = useFileContext();

  const handleSave = () => {
    console.log(`🔹 Save button clicked. File: ${fileName}, Directory: ${directory}`);
    if (!fileName) {
      alert('Please enter a file name.');
      return;
    }
    if (!directory) {
      alert('Please enter a directory.');
      return;
    }
    saveLayout();  
  };

  const handleLoad = () => {
    console.log(`🔄 Load button clicked. File: ${fileName}, Directory: ${directory}`);
  
    if (!fileName) {
      alert('Please enter a file name.');
      return;
    }
    if (!directory) {
      alert('Please enter a directory.');
      return;
    }
    loadLayout();  
  };

  return (
    <div className="file-manager">
      <input 
        type="text" 
        value={fileName} 
        onChange={(e) => setFileName(e.target.value)} 
        placeholder="Enter file name..."
        className="file-input"
      />

      <input 
        type="text" 
        value={directory} 
        onChange={(e) => setDirectory(e.target.value)} 
        placeholder="Enter directory..."
        className="directory-input"
      />

      <select 
        value={directory} 
        onChange={(e) => { 
          let selectedDir = e.target.value;
          if (!selectedDir.endsWith('/')) {
            selectedDir += '/';
          }
          console.log(`🔄 Directory changed to: ${selectedDir}`);
          setDirectory(selectedDir); 
        }} 
        className="directory-select"
      >
        <option value="valleyFixedCoord/">valleyFixedCoord/</option>
        <option value="homestead/">homestead/</option>
        <option value="town/">town/</option>
        <option value="valley0/">valley0/</option>
        <option value="valley1/">valley1/</option>
        <option value="valley2/">valley2/</option>
        <option value="valley3/">valley3/</option>
      </select>

      <div className="button-group">
        <button className="small-button" onClick={handleLoad}>Load</button>
        <button className="small-button save-button" onClick={handleSave}>Save</button>
      </div>
    </div>
  );
};

export default FileManager;

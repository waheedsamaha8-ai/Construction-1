/**
 * @fileoverview Robust Google Apps Script for Construction Manager Pro.
 * Optimized for Caching and 2MB Chunks.
 */

const ROOT_ID = '1DhEqRKw6ynsLv-1pAuU-49pNvOzE8wAL';

function doGet() {
  return HtmlService.createHtmlOutput("<h1>Construction Manager API is Running</h1>")
      .setTitle("Construction Pro API");
}

function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const action = e.parameter.action || contents.action;
    let result = {};

    switch (action) {
      case 'getProjects':
        result = getProjects();
        break;
      case 'createProject':
        result = createProject(JSON.parse(contents.data));
        break;
      case 'updateProject':
        result = updateProject(JSON.parse(contents.data));
        break;
      case 'getContents':
        result = getContents(contents.folderId);
        break;
      case 'createFolder':
        result = createFolder(contents.name, contents.parentId);
        break;
      case 'delete':
        result = deleteItem(contents.id);
        break;
      case 'uploadChunk':
        result = uploadChunk(contents);
        break;
      case 'saveLetter':
        result = saveLetter(contents);
        break;
      case 'getFileContent':
        result = getFileContent(contents.fileId);
        break;
      default:
        throw new Error('Action not recognized: ' + action);
    }

    return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
  }
}

function getSafeFolder(id) {
  if (!id || id === 'undefined' || id === 'null' || id === '') {
    return DriveApp.getFolderById(ROOT_ID);
  }
  try {
    return DriveApp.getFolderById(id);
  } catch (e) {
    // If folder not found (deleted), return root
    return DriveApp.getFolderById(ROOT_ID);
  }
}

function getProjects() {
  const rootFolder = DriveApp.getFolderById(ROOT_ID);
  const folders = rootFolder.getFolders();
  const projects = [];

  while (folders.hasNext()) {
    const folder = folders.next();
    if (folder.isTrashed()) continue;
    
    let metadata = {
      id: folder.getId(),
      name: folder.getName(),
      status: 'جاري التنفيذ',
      calculatedProgress: 0
    };

    // Optimization: Check for metadata file but don't fail if read errors occur
    const files = folder.getFilesByName('metadata.json');
    if (files.hasNext()) {
      try {
        const content = files.next().getBlob().getDataAsString();
        const json = JSON.parse(content);
        metadata = { ...metadata, ...json };
      } catch (e) {}
    }
    projects.push(metadata);
  }
  return projects;
}

function createProject(data) {
  const rootFolder = DriveApp.getFolderById(ROOT_ID);
  const projectFolder = rootFolder.createFolder(data.name);
  const projectId = projectFolder.getId();
  
  const subfolders = data.folders || ['الرسومات', 'المقايسات', 'الصور', 'المخاطبات'];
  subfolders.forEach(name => projectFolder.createFolder(name));
  
  const metadata = { ...data, id: projectId, createdAt: new Date().toISOString() };
  projectFolder.createFile('metadata.json', JSON.stringify(metadata), 'application/json');
  
  return metadata;
}

function updateProject(data) {
  const folder = getSafeFolder(data.id);
  if (data.name) folder.setName(data.name);
  
  const files = folder.getFilesByName('metadata.json');
  const metadataStr = JSON.stringify(data);
  
  if (files.hasNext()) {
    files.next().setContent(metadataStr);
  } else {
    folder.createFile('metadata.json', metadataStr, 'application/json');
  }
  return { status: 'updated' };
}

function getContents(folderId) {
  const folder = getSafeFolder(folderId);
  const contents = [];

  const subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    const f = subfolders.next();
    if (f.isTrashed()) continue;
    contents.push({ id: f.getId(), name: f.getName(), type: 'folder', createdTime: f.getDateCreated().getTime() });
  }

  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.isTrashed() || f.getName() === 'metadata.json') continue;
    contents.push({ id: f.getId(), name: f.getName(), type: 'file', mimeType: f.getMimeType(), createdTime: f.getDateCreated().getTime() });
  }
  return contents;
}

function createFolder(name, parentId) {
  const parent = getSafeFolder(parentId);
  const newFolder = parent.createFolder(name);
  return { id: newFolder.getId(), status: 'created' };
}

function deleteItem(id) {
  if (!id) return { error: 'No ID' };
  try {
    const file = DriveApp.getFileById(id);
    file.setTrashed(true);
    return { status: 'deleted' };
  } catch (e) {
    try {
      const folder = DriveApp.getFolderById(id);
      folder.setTrashed(true);
      return { status: 'deleted' };
    } catch (err) {
      return { error: 'Not found' };
    }
  }
}

function uploadChunk(payload) {
  const { data, name, mimeType, parentId, fileId, isLast, chunkIndex } = payload;
  const chunkData = Utilities.base64Decode(data);
  const props = PropertiesService.getUserProperties();
  const tempKey = 'temp_file_' + parentId + '_' + name.replace(/[^a-zA-Z0-9]/g, '');
  let currentFileId = fileId;

  try {
    if (chunkIndex === '0') {
      const blob = Utilities.newBlob(chunkData, mimeType || 'application/octet-stream', name);
      const folder = getSafeFolder(parentId);
      const file = folder.createFile(blob);
      currentFileId = file.getId();
      props.setProperty(tempKey, currentFileId);
    } else {
      const storedId = fileId || props.getProperty(tempKey);
      if (!storedId) throw new Error("Missing File ID for continuation");
      
      const file = DriveApp.getFileById(storedId);
      
      // Critical check for GAS limits
      // GAS cannot handle creating blobs larger than ~50MB in memory easily.
      // If we hit the limit, this line will throw the "exceeds maximum file size" error.
      // By reducing chunk size in the client, we minimize the frequency of this, 
      // but for files > 50MB, this method has hard limits without Advanced Drive Service.
      const newContent = file.getBlob().getBytes().concat(chunkData);
      file.setContent(Utilities.newBlob(newContent, mimeType, name));
      
      currentFileId = storedId;
    }

    if (isLast === 'true') {
      props.deleteProperty(tempKey);
      return { status: 'success', fileId: currentFileId };
    }
    
    return { status: 'in_progress', fileId: currentFileId };

  } catch (err) {
    // If we hit the size limit, return a specific error
    if (err.toString().includes('exceeds the maximum file size')) {
      return { status: 'error', error: 'File too large for standard upload. Max ~45MB.' };
    }
    return { error: err.toString(), status: 'error' };
  }
}

function saveLetter(payload) {
  const { parentId, name, content, fileId } = payload;
  const parent = getSafeFolder(parentId);
  const safeMimeType = "text/html"; 
  
  if (fileId && fileId !== 'undefined' && fileId !== 'null') {
    const file = DriveApp.getFileById(fileId);
    file.setContent(content);
    file.setName(name);
    return { fileId: file.getId(), status: 'updated' };
  } else {
    const file = parent.createFile(name, content, safeMimeType);
    return { fileId: file.getId(), status: 'created' };
  }
}

function getFileContent(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    return { content: file.getBlob().getDataAsString() };
  } catch (e) {
    return { content: '' };
  }
}

let images = [];
let worker;

// DOM Elements
const imageInput = document.getElementById('imageInput');
const imageTree = document.getElementById('imageTree');
const outputNameInput = document.getElementById('outputName');
const widthInput = document.getElementById('widthInput');
const heightInput = document.getElementById('heightInput');
const qualityInput = document.getElementById('qualityInput');
const formatSelect = document.getElementById('formatSelect');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const progressBar = document.getElementById('progress');
const progressText = document.getElementById('progressText');
const logElement = document.getElementById('log');

// Log Function
function log(message) {
    logElement.textContent += message + '\n';
    logElement.scrollTop = logElement.scrollHeight;
}

// Update Progress
function updateProgress(percent) {
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${Math.round(percent)}%`;
}

// Render Tree Panel
function renderTree() {
    imageTree.innerHTML = '';
    images.forEach((img, index) => {
        const li = document.createElement('li');
        li.textContent = img.name;
        li.draggable = true;
        li.dataset.index = index;
        li.addEventListener('dragstart', handleDragStart);
        li.addEventListener('dragover', handleDragOver);
        li.addEventListener('drop', handleDrop);
        imageTree.appendChild(li);
    });
}

// Drag and Drop Handlers
function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.dataset.index);
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDrop(e) {
    e.preventDefault();
    const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
    const targetIndex = parseInt(e.target.dataset.index);
    if (draggedIndex === targetIndex) return;

    const [draggedItem] = images.splice(draggedIndex, 1);
    images.splice(targetIndex, 0, draggedItem);
    renderTree();
}

// Image Upload Handler
imageInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
        if (file.type.startsWith('image/')) {
            images.push(file);
        }
    });
    renderTree();
    log(`تعداد ${files.length} تصویر آپلود شد.`);
});

// Start Processing
startBtn.addEventListener('click', () => {
    if (images.length === 0) {
        log('خطا: هیچ تصویری آپلود نشده است.');
        return;
    }

    const settings = {
        width: parseInt(widthInput.value),
        height: parseInt(heightInput.value),
        quality: parseInt(qualityInput.value) / 100,
        format: formatSelect.value,
        outputName: outputNameInput.value || 'manhwa_output'
    };

    log('شروع پردازش تصاویر...');
    startBtn.disabled = true;
    updateProgress(0);

    // Initialize Web Worker
    worker = new Worker('worker.js');
    worker.postMessage({ images, settings });

    worker.onmessage = (e) => {
        const { type, data } = e.data;
        if (type === 'progress') {
            updateProgress(data);
        } else if (type === 'log') {
            log(data);
        } else if (type === 'result') {
            const zip = new JSZip();
            data.forEach((imageData, index) => {
                const paddedIndex = String(index + 1).padStart(3, '0');
                const fileName = `${paddedIndex}.${settings.format}`;
                zip.file(fileName, imageData, { binary: true });
            });

            zip.generateAsync({ type: 'blob' }).then(blob => {
                saveAs(blob, `${settings.outputName}.zip`);
                log('فایل زیپ با موفقیت دانلود شد.');
                startBtn.disabled = false;
            });
        }
    };

    worker.onerror = (err) => {
        log(`خطا در پردازش: ${err.message}`);
        startBtn.disabled = false;
    };
});

// Reset Handler
resetBtn.addEventListener('click', () => {
    images = [];
    renderTree();
    logElement.textContent = '';
    updateProgress(0);
    startBtn.disabled = false;
    imageInput.value = '';
    outputNameInput.value = 'manhwa_output';
    widthInput.value = 800;
    heightInput.value = 12000;
    qualityInput.value = 95;
    formatSelect.value = 'webp';
    log('ریست انجام شد.');
});

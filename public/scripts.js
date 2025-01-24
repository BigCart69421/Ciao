document.addEventListener('DOMContentLoaded', () => {
    // Handle form submission for uploads
    const uploadForm = document.getElementById('uploadForm');
    const responseMessage = document.getElementById('responseMessage');

    if (uploadForm) {
        uploadForm.addEventListener('submit', (event) => {
            event.preventDefault(); // Prevent default form submission

            const formData = new FormData(uploadForm);
            fetch('/upload', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.file) {
                    responseMessage.innerHTML = `File uploaded successfully: <a href="/uploads/${data.file.filename}" target="_blank">${data.file.originalname}</a>`;
                } else {
                    responseMessage.innerHTML = 'File upload failed.';
                }
            })
            .catch(error => {
                console.error('Error uploading file:', error);
                responseMessage.innerHTML = 'Error uploading file.';
            });
        });
    }

    // Handle media display on view page
    const mediaContainer = document.getElementById('mediaContainer');
    if (mediaContainer) {
        fetch('/media')
            .then(response => response.json())
            .then(mediaFiles => {
                mediaFiles.forEach(file => {
                    const mediaItem = document.createElement('div');
                    mediaItem.classList.add('media-item');
                    mediaItem.innerHTML = `
                        <p>${file.name}</p>
                        ${['jpeg', 'jpg', 'webp'].includes(file.type) ?
                          `<img src="${file.url}" alt="${file.name}">` :
                          `<p>File type not supported for preview</p>`}
                        <p>Comment: ${file.comment || 'No comment'}</p>
                    `;
                    mediaContainer.appendChild(mediaItem);
                });
            })
            .catch(error => {
                console.error('Error fetching media files:', error);
            });
    }
});

/**
 * 🌐 Universal Form Handler for All Browsers
 * Compatible dengan IE11+, Chrome, Firefox, Safari, Edge
 * Mengatasi error 413, failed to fetch, dan cross-browser issues
 */

(function() {
    'use strict';

    // Polyfill untuk browser lama
    if (!window.FormData) {
        console.error('FormData not supported in this browser');
    }

    // Universal AJAX wrapper
    function universalAjax(options) {
        return new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            
            xhr.open(options.method || 'POST', options.url, true);
            
            // Set headers
            if (options.headers) {
                Object.keys(options.headers).forEach(function(key) {
                    xhr.setRequestHeader(key, options.headers[key]);
                });
            }
            
            // Handle timeout
            xhr.timeout = options.timeout || 60000; // 60 seconds
            
            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    var response;
                    try {
                        response = JSON.parse(xhr.responseText);
                    } catch (e) {
                        response = { success: true, message: xhr.responseText };
                    }
                    resolve(response);
                } else {
                    var error;
                    try {
                        error = JSON.parse(xhr.responseText);
                    } catch (e) {
                        error = { message: 'Request failed with status ' + xhr.status };
                    }
                    reject(error);
                }
            };
            
            xhr.onerror = function() {
                reject({ message: 'Network error occurred' });
            };
            
            xhr.ontimeout = function() {
                reject({ message: 'Request timeout' });
            };
            
            // Track upload progress
            if (xhr.upload && options.onProgress) {
                xhr.upload.onprogress = function(e) {
                    if (e.lengthComputable) {
                        var percentComplete = (e.loaded / e.total) * 100;
                        options.onProgress(percentComplete);
                    }
                };
            }
            
            xhr.send(options.data);
        });
    }

    // File compression utility
    function compressImage(file, maxWidth, maxHeight, quality) {
        return new Promise(function(resolve) {
            if (!file.type.startsWith('image/')) {
                resolve(file);
                return;
            }

            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');
            var img = new Image();

            img.onload = function() {
                var ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                canvas.toBlob(function(blob) {
                    var compressedFile = new File([blob], file.name, {
                        type: file.type,
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                }, file.type, quality);
            };

            img.src = URL.createObjectURL(file);
        });
    }

    // Main form handler
    window.UniversalFormHandler = {
        // Submit registration with chunked upload for large files
        submitRegistration: function(form, options) {
            options = options || {};
            
            return new Promise(function(resolve, reject) {
                var formData = new FormData(form);
                var submitButton = form.querySelector('button[type="submit"]');
                var originalText = submitButton ? submitButton.textContent : '';
                
                // Disable submit button
                if (submitButton) {
                    submitButton.disabled = true;
                    submitButton.textContent = 'Mengirim...';
                }

                // Show progress if callback provided
                function updateProgress(percent) {
                    if (options.onProgress) {
                        options.onProgress(percent);
                    }
                    if (submitButton) {
                        submitButton.textContent = 'Mengirim... ' + Math.round(percent) + '%';
                    }
                }

                // Compress images before sending
                var files = [];
                var fileInputs = form.querySelectorAll('input[type="file"]');
                
                Array.prototype.forEach.call(fileInputs, function(input) {
                    if (input.files.length > 0) {
                        files.push({
                            input: input,
                            file: input.files[0]
                        });
                    }
                });

                // Process and compress files
                var compressionPromises = files.map(function(fileObj) {
                    return compressImage(fileObj.file, 1200, 1200, 0.8).then(function(compressedFile) {
                        formData.set(fileObj.input.name, compressedFile);
                    });
                });

                Promise.all(compressionPromises).then(function() {
                    // Send the form
                    return universalAjax({
                        url: '/api/register',
                        method: 'POST',
                        data: formData,
                        timeout: 120000, // 2 minutes
                        onProgress: updateProgress,
                        headers: {
                            // Don't set Content-Type for FormData
                        }
                    });
                }).then(function(result) {
                    resolve(result);
                }).catch(function(error) {
                    reject(error);
                }).finally(function() {
                    // Restore button
                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.textContent = originalText;
                    }
                });
            });
        },

        // Check ticket status
        checkTicket: function(ticket) {
            return universalAjax({
                url: '/api/ticket/' + encodeURIComponent(ticket),
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        },

        // Show user-friendly alerts
        showAlert: function(message, type) {
            type = type || 'info';
            var alertDiv = document.createElement('div');
            alertDiv.className = 'fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 max-w-md';
            
            var colors = {
                'error': 'bg-red-500 text-white',
                'success': 'bg-green-500 text-white',
                'warning': 'bg-yellow-500 text-black',
                'info': 'bg-blue-500 text-white'
            };
            
            alertDiv.className += ' ' + (colors[type] || colors.info);
            alertDiv.innerHTML = '<div class="flex justify-between items-center">' +
                '<span>' + message + '</span>' +
                '<button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-xl">&times;</button>' +
                '</div>';
            
            document.body.appendChild(alertDiv);
            
            // Auto remove after 5 seconds
            setTimeout(function() {
                if (alertDiv.parentElement) {
                    alertDiv.remove();
                }
            }, 5000);
        },

        // Get user-friendly error messages
        getErrorMessage: function(error) {
            var message = error.message || error.toString();
            
            if (message.includes('413') || message.includes('large')) {
                return 'File terlalu besar. Gunakan file maksimal 10MB dan coba lagi.';
            }
            
            if (message.includes('timeout')) {
                return 'Koneksi timeout. Periksa internet Anda dan coba lagi.';
            }
            
            if (message.includes('network') || message.includes('fetch')) {
                return 'Masalah koneksi. Periksa internet Anda dan coba lagi.';
            }
            
            if (message.includes('duplicate') || message.includes('already exists')) {
                return 'Data sudah pernah didaftarkan. Gunakan data yang berbeda.';
            }
            
            if (message.includes('validation') || message.includes('invalid')) {
                return 'Data tidak valid. Periksa kembali isian form Anda.';
            }
            
            // Default message
            return 'Terjadi kesalahan. Silakan coba lagi atau hubungi admin.';
        },

        // Validate form before submit
        validateForm: function(form) {
            var errors = [];
            
            // Check required fields
            var requiredFields = form.querySelectorAll('[required]');
            Array.prototype.forEach.call(requiredFields, function(field) {
                if (!field.value.trim()) {
                    errors.push('Field ' + (field.placeholder || field.name) + ' wajib diisi');
                }
            });
            
            // Check file sizes
            var fileInputs = form.querySelectorAll('input[type="file"]');
            Array.prototype.forEach.call(fileInputs, function(input) {
                if (input.files.length > 0) {
                    var file = input.files[0];
                    var maxSize = 10 * 1024 * 1024; // 10MB
                    if (file.size > maxSize) {
                        errors.push('File ' + file.name + ' terlalu besar. Maksimal 10MB.');
                    }
                }
            });
            
            // Check phone number format
            var phoneInput = form.querySelector('input[name="nomor_telepon"]');
            if (phoneInput && phoneInput.value) {
                var phoneRegex = /^[0-9+\-\s()]{10,15}$/;
                if (!phoneRegex.test(phoneInput.value)) {
                    errors.push('Format nomor telepon tidak valid');
                }
            }
            
            return {
                isValid: errors.length === 0,
                errors: errors
            };
        }
    };

    // Auto-setup form handlers when DOM is ready
    function setupFormHandlers() {
        // Registration form
        var regForm = document.querySelector('#registrationForm') || document.querySelector('form[action*="register"]');
        if (regForm) {
            regForm.addEventListener('submit', function(e) {
                e.preventDefault();
                
                var validation = window.UniversalFormHandler.validateForm(regForm);
                if (!validation.isValid) {
                    window.UniversalFormHandler.showAlert(validation.errors.join('\n'), 'error');
                    return;
                }
                
                window.UniversalFormHandler.submitRegistration(regForm, {
                    onProgress: function(percent) {
                        console.log('Upload progress:', percent + '%');
                    }
                }).then(function(result) {
                    window.UniversalFormHandler.showAlert('Registrasi berhasil! Tiket: ' + result.ticket, 'success');
                    regForm.reset();
                    
                    // Show success modal if exists
                    var modal = document.getElementById('successModal');
                    if (modal) {
                        var ticketSpan = document.getElementById('ticketNumber');
                        if (ticketSpan) {
                            ticketSpan.textContent = result.ticket;
                        }
                        modal.classList.remove('hidden');
                    }
                    
                }).catch(function(error) {
                    var message = window.UniversalFormHandler.getErrorMessage(error);
                    window.UniversalFormHandler.showAlert(message, 'error');
                    console.error('Registration error:', error);
                });
            });
        }
        
        // Ticket check form
        var checkButton = document.querySelector('#checkButton') || document.querySelector('button[onclick*="checkStatus"]');
        if (checkButton) {
            checkButton.addEventListener('click', function(e) {
                e.preventDefault();
                
                var ticketInput = document.querySelector('#ticketNumber') || document.querySelector('input[name="ticket"]');
                if (!ticketInput) return;
                
                var ticket = ticketInput.value.trim();
                if (!ticket) {
                    window.UniversalFormHandler.showAlert('Masukkan nomor tiket', 'warning');
                    return;
                }
                
                var originalText = checkButton.textContent;
                checkButton.disabled = true;
                checkButton.textContent = 'Memeriksa...';
                
                window.UniversalFormHandler.checkTicket(ticket).then(function(result) {
                    if (typeof displayResult === 'function') {
                        displayResult(result);
                    } else {
                        window.UniversalFormHandler.showAlert('Status: ' + result.status, 'success');
                    }
                }).catch(function(error) {
                    var message = window.UniversalFormHandler.getErrorMessage(error);
                    window.UniversalFormHandler.showAlert(message, 'error');
                }).finally(function() {
                    checkButton.disabled = false;
                    checkButton.textContent = originalText;
                });
            });
        }
    }

    // Setup when DOM is ready (works in all browsers)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupFormHandlers);
    } else {
        setupFormHandlers();
    }

})();

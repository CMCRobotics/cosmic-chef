AFRAME.registerComponent('load-fragment', {
    schema: {
        src: {type: 'string', default: ''},
        templateId: {type: 'string', default: ''},
        renameEntityIds: {type: 'boolean', default: true}
    },

    init: function() {
        const log = window.log.getLogger('load-fragment');
        const src = this.data.src;
        const templateId = this.data.templateId;
        const renameEntityIds = this.data.renameEntityIds;

        if (!src || !templateId) {
            log.error('load-fragment component requires both src and templateId parameters');
            return;
        }

        fetch(src)
            .then(response => response.text())
            .then(html => {
                const template = document.createElement('template');
                template.innerHTML = html;
                template.id = templateId;
                document.head.appendChild(template);

                if (template) {
                    const clone = document.importNode(template.content, true);

                    if(renameEntityIds){
                        // Namespace all IDs in the clone to avoid collisions when loading multiple instances
                        const instanceCount = document.querySelectorAll(`[data-load-fragment-source="${templateId}"]`).length;
                        clone.querySelectorAll('[id]').forEach(el => {
                            el.setAttribute('id', `${el.id}__${templateId}_${instanceCount}`);
                        });
                    }

                    // Mark the parent entity so we can count instances on next load
                    this.el.setAttribute('data-load-fragment-source', templateId);
                    this.el.appendChild(clone);
                }
            })
            .catch(error => {
                log.error('Error loading fragment:', error);
            });
    }
});

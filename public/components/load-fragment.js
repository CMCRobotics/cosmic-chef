AFRAME.registerComponent('load-fragment', {
    schema: {
        src: {type: 'string', default: ''},
        templateId: {type: 'string', default: ''}
    },

    init: function() {
        const src = this.data.src;
        const templateId = this.data.templateId;

        if (!src || !templateId) {
            console.error('load-fragment component requires both src and templateId parameters');
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
                    this.el.appendChild(clone);
                }
            })
            .catch(error => {
                console.error('Error loading fragment:', error);
            });
    }
});

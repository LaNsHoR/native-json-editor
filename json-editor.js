class JSON_Editor extends HTMLElement {
    constructor() {
        super()
        const template = document.createElement('template')
        template.innerHTML = `
            <style>
                :host(json-editor) {
                    display: inline-flex;
                    width: 300px;
                    height: 150px;
                    background: #252530;
                    color: #fff;
                    font-family: monospace;
                    padding: 4px;
                }

                div {
                    outline: 0;
                    flex-grow: 1;
                    overflow: auto;
                }

               *[part=number]        { color: #a9dc76 }
               *[part=braces]        { color: #84aecc }
               *[part=brackets]      { color: #d26a6a }
               *[part=colon]         { color: #ffffff }
               *[part=comma]         { color: #ffff25 }
               *[part=string]        { color: #78dce8 }
               *[part=string_quotes] { color: #E393FF }
               *[part=key]           { color: #ff6188 }
               *[part=key_quotes]    { color: #fc9867 }
               *[part=null]          { color: #cccccc }
               *[part=true]          { color: #c2e69f }
               *[part=false]         { color: #e69fc2 }
            </style>
            <div id="editor" contentEditable="true" tabIndex="0"></div>
        `

        this.last_string_content = ''
        this.attachShadow({ mode: 'open' })
        this.shadowRoot.appendChild( template.content.cloneNode(true) )
        this.editor = this.shadowRoot.getElementById('editor')
        this.addEventListener('keyup', _ => this.format() )
    }

    connectedCallback() {
        this.indent = Number(this.getAttribute('indent')) || 3
        this.value = this.getAttribute('value')
    }

    //===[ Caret Control ]=================================================

    get_selection() {
        if( this.shadowRoot.getSelection )
            return this.shadowRoot.getSelection()
        return document.getSelection()
    }

    // return a "pointer" with relevant information about the caret position
    get_caret_pointer() {
        const selection = this.get_selection()
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0)
            const caret_range = range.cloneRange()
            caret_range.selectNodeContents(this.editor)
            caret_range.setEnd(range.endContainer, range.endOffset)
            const section = caret_range.toString()
            const character = section[section.length-1]
            const occurrence = this.get_number_of_occurrences(section, character)
            return { character, occurrence, section }
        }
        return null
    }

    // set the caret position based on pointer information
    set_caret_from_pointer(pointer) {
        const selection = window.getSelection()
        const range = document.createRange()
        let nodes_to_explore = this.get_text_nodes(this.editor)
        let occurrence = pointer.occurrence
        let fount_at = 0
        let i=0

        for(i=0; i<nodes_to_explore.length; i++) {
            const node = nodes_to_explore[i]
            fount_at = this.get_position_of_occurrence(node.textContent, pointer.character, occurrence)
            if(fount_at >= 0 )
                break
            occurrence -= this.get_number_of_occurrences(node.textContent, pointer.character)
        }

        fount_at++
        range.setStart(nodes_to_explore[i], fount_at)
        range.setEnd(nodes_to_explore[i], fount_at)
        selection.removeAllRanges()
        selection.addRange(range)
    }

    //===[ Utils ]=========================================================

    // escape string special characters used in regular expressions
    escape_regex_string(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    // return the position of the occurrence-th sub_string occurrence
    get_position_of_occurrence(string, sub_string, occurrence) {
        const position = string.split(sub_string, occurrence).join(sub_string).length
        return position === string.length ? -1 : position
    }

    // return the number of sub_string occurrences
    get_number_of_occurrences(string, sub_string) {
        return sub_string ? string.replace(new RegExp(`[^${this.escape_regex_string(sub_string)}]`, 'g'), '').length : 0
    }

    // return the element's children text nodes
    get_text_nodes(element) {
        let node, list=[], walk=document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false)
        while(node=walk.nextNode())
            list.push(node)
        return list
    }

    //===[ Formatting ]====================================================

    escape_html(input) {
        const replace = [ ['&', '&amp;'], ['<', '&lt;'], ['>', '&gt;'], ['"', '&quot;'], ["'", '&#039;'] ]
        return replace.reduce( ( escaped, replacement) => escaped.replaceAll( ...replacement ), input)
    }
   
    // format a json object
    format_object(input, offset=0) {
        // in JS typeof null returns "object" (legacy bug), for null input we just return null
        if( input === null )
            return '<span part="null">null</span>'
        let output = ''
        output += `<span part="braces">{</span><br>\n`
        output += Object.keys(input).map((key, index, list) => {
            return `${'&nbsp;'.repeat(offset+this.indent)}<span part="key" part="key"><span part="key_quotes">\"</span>${this.escape_html(key)}<span part="key_quotes">\"</span></span><span part="colon">:</span><span part="value">${this.format_input(input[key], offset+this.indent)}</span>${index < list.length-1 ? '<span part="comma">,</span>' : ''}<br>\n`
        }).join('')
        output += '&nbsp;'.repeat(offset)
        output += `<span part="braces">}</span>`
        return output
    }

    // format a json array
    format_array(input, offset=0) {
        let output = ''
        output += `<span part="brackets">[</span><br>\n`
        output += input.map((value, index, list) => {
            return `${'&nbsp;'.repeat(offset+this.indent)}<span>${this.format_input(value, offset+this.indent)}</span>${index < list.length-1 ? '<span part="comma">,</span>' : ''}<br>\n`
        }).join('')
        output += '&nbsp;'.repeat(offset)
        output += `<span part="brackets">]</span>`
        return output
    }

    // format a json string
    format_string(input) {
        return `<span part="string"><span part="string_quotes">\"</span>${this.escape_html(input)}<span part="string_quotes">\"</span></span>`;
    }

    // format a boolean
    format_boolean(input) {
        return `<span part="${input}">${input}</span>`;
    }

    // format a number
    format_number(input) {
        return `<span part="number">${input}</span>`;
    }

    // format a json input
    format_input(input, offset=0) {
        const type = Array.isArray(input) ? 'array' : typeof input
        switch (type) {
            case 'object':
                return this.format_object(input, offset)
            case 'array':
                return this.format_array(input, offset)
            case 'string':
                return this.format_string(input)
            case 'boolean':
                return this.format_boolean(input)
            case 'number':
                return this.format_number(input)
            default:
                return input
        }
    }

    format() {
        const editor = this.editor
        const pointer = this.get_caret_pointer()
        let content = ''
        try {
            content = JSON.parse(this.raw_string)
        }
        catch(exception) {
            return
        }

        // prevent unnecesary render
        const current_string_content = JSON.stringify(content)
        if(!content || current_string_content == this.last_string_content)
            return

        editor.innerHTML = this.format_input(content)
        this.last_string_content = current_string_content
        if(pointer && focus)
            this.set_caret_from_pointer(pointer)
    }

    //===[ Getters / Setters ]=============================================

    get raw_string() {
        // remove %A0 (NBSP) characters, which are no valid in JSON
        return this.editor.innerText?.replaceAll('\xa0', '') || ''
    }

    set raw_string( input ) {
        this.string_value = input
    }

    get string_value() {
        return this.last_string_content
    }

    set string_value( input ) {
        this.editor.innerText = input
        this.format()
    }

    get value() {
        return this.string_value
    }

    set value( input ) {
        return this.string_value = input
    }

    get json_value() {
        return JSON.parse( this.string_value )
    }

    set json_value( input ) {
        this.string_value = JSON.stringify( input )
    }

    is_valid() {
        try {
            JSON.parse( this.raw_string )
            return true
        }
        catch(e) {
            return false
        }
    }
}

customElements.define('json-editor', JSON_Editor)

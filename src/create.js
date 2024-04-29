
const nColsSticky = 3

import ecephysRec from './assets/table_data/ecephys_recording.json' assert { type: 'json' };
import ecephysSort from './assets/table_data/ecephys_sorting.json' assert { type: 'json' };
import icephys from './assets/table_data/icephys.json' assert { type: 'json' };
import ophysImg from './assets/table_data/ophys_imaging.json' assert { type: 'json' };
import ophysSeg from './assets/table_data/ophys_segmentation.json' assert { type: 'json' };
import behavior from './assets/table_data/behavior.json' assert { type: 'json' };

const subHeaderDelineator = ' - '
const guideValue = 'NWB GUIDE'
const knownFormatsValue = 'Known Formats'

const columnOrder = [
    "Modality",
    knownFormatsValue,
    "Format",
    // "Versions",
    "Suffixes",
    "Example Data",
    "Neo",
    "SpikeInterface",
    "ROIExtractors",
    "NeuroConv",
    guideValue,
    "Status"
]

const totalAssociations = {
    [guideValue]: "NeuroConv - Interface",
    "SpikeInterface - Extractor": "Neo - Raw IO",
}

const tableRegistry = [
    { id: 'ecepys-recording', modality: 'Ecephys - Recording', data: ecephysRec, keywords: ['ecephys', 'recording']},
    { id: 'ecepys-sorting', modality: 'Ecephys - Sorting', data: ecephysSort, keywords: ['ecephys', 'sorting']},
    { id: 'icephys', modality: 'Icephys', data: icephys, keywords: ['icephys']},
    { id: 'ophys-imaging', modality: 'Ophys - Imaging', data: ophysImg, keywords: ['ophys', 'imaging']},
    { id: 'ophys-segmentation', modality: 'Ophys - Segmentation', data: ophysSeg, keywords: ['ophys', 'segmentation']},
    { id: 'behavior', modality: 'Behavior', data: behavior, keywords: ['behavior']}
]


export const setTable = ({ table, tabs, filter = [], tab = 'overview' }) => {

    if (!Array.isArray(filter)) filter = [ filter ]


    const overviewCols = ['Modality']

    const totals = {}

    const tables = []

    tableRegistry.forEach(info => {
        const { keywords } = info
        if (filter.length && !keywords.some(k => filter.includes(k))) return
        tables.push(info)
    })

    if (!tables.length) {
        console.warn('No tables found for filter', filter)
        tables.push(...tableRegistry)
    }

    const overviewData = tables.map((info) => {
        const colSet = new Set()
        const { data, modality } = info
        data.forEach(arr => Object.keys(arr).forEach(k => colSet.add(k)))
        data.columns = Array.from(colSet)

        const stats = data.reduce((acc, cell) => {
            Object.keys(cell).forEach(k => {
                let value = cell[k]
                if (value?.value) value = value.value

                if (typeof value === 'boolean') {
                    if (!overviewCols.includes(k)) overviewCols.push(k)
                    if (!acc[k]) acc[k] = 0

                    if (!totals[modality]) totals[modality] = {}
                    if (!totals[modality][k]) totals[modality][k] = { value: 0, total: 0 }

                    if (value) {
                        acc[k]++
                        totals[modality][k].value++
                    }

                    totals[modality][k].total++ // Add to the total number of known interfaces
                }
            })

            return acc
        }, {})

        return { Modality: modality, [knownFormatsValue]: data.length, ...stats }
    })

    const modalities = tables.map(({ modality }) => modality)

    modalities.forEach(modality => {

        Object.entries(totalAssociations).forEach(([target, source]) => {
            if (target in totals[modality]) {
                const currentTotal = totals[modality][target].total
                const actualTotal = totals[modality][source]?.value
                if (actualTotal != undefined) totals[modality][target].total = actualTotal
            }
        })
    })


    const columnTotals = {}
    const totalRow = { Modality: "Total", [knownFormatsValue]: 0 }

    modalities.forEach(modality => {

        for (let col in totals[modality]) {
            if (!totalRow[col]) totalRow[col] = 0
            if (!columnTotals[col]) columnTotals[col] = { total: 0 }
            totalRow[col] += totals[modality][col].value
            columnTotals[col].total += totals[modality][col].total
        }
    })

    overviewData.forEach(row => {
        totalRow[knownFormatsValue] += row[knownFormatsValue]
    })

    overviewData.push(totalRow)

    totals.Total = columnTotals

    overviewData.columns = [...overviewCols, knownFormatsValue]
    overviewData.totals = totals

    tables.unshift({ id: 'overview', modality: 'Overview', data: overviewData, keywords: [] })

    function getPercent(value, total) {
        return `${value}<small>${value && total ? ` (${(100 * value / total).toFixed(1)}%)` : ''}</small>`
    }

    function createCell(value, { total } = {}) {
        const td = document.createElement('td')

        let url;

        if (typeof value === 'string') {
            const [title, subtitle] = value.split(' - ')
            td.innerHTML = `${title}<br><small>${subtitle ?? ""}</small>`
        }

        else {

            if (value && typeof value === 'object') {
                url = value.url
                value = value.value
            }

            if (value != undefined) td.innerHTML = getPercent(value, total)

            const frac = value / total
            td.style.background = fractionToColor(value / total, .4)
        }

        if (url) {
            td.classList.add('link')
            td.onclick = () => window.open(url, '_blank')
        }

        td.setAttribute('value', value)

        return td
    }

    function addColumnsToTable(table, info, nColsSticky) {

        let merged = null;
        let headerRowSize = 1
        const nestedRowInfo = []

        // Derive nested headers
        const headers = {}

        const formatHeader = 'Format'
        const versionsHeader = 'Versions'

        const cols = info.columns
            .sort((a, b) => {
                const [aTitle] = a.split(subHeaderDelineator)
                const [bTitle] = b.split(subHeaderDelineator)
                const aIdx = columnOrder.indexOf(aTitle)
                const bIdx = columnOrder.indexOf(bTitle)
                if (aIdx === -1 && bIdx === -1) return 0
                if (aIdx === -1) return 1
                if (bIdx === -1) return -1
                return aIdx - bIdx
            })

        const totals = info.totals ?? {}
        const formatIdx = cols.findIndex((v) => v === formatHeader)
        const versionsIdx = cols.findIndex((v) => v === versionsHeader)


        // Update format column to include versions as subtitles
        if (formatIdx !== -1 && versionsIdx !== -1) {
            info.forEach(row => {
                if (row[versionsHeader]) row[formatHeader] += ` - ${row[versionsHeader]}`
            })

            cols.splice(versionsIdx, 1)
        }

        cols.forEach(str => {

            const [title, subtitle] = str.split(subHeaderDelineator)

            const consolidated = headers[title]

            if (subtitle) {
                headerRowSize = 2
                nestedRowInfo.push(subtitle)
                if (consolidated) consolidated.push(str)
                else {
                    headers[title] = [str]
                }
            } else headers[str] = true
        })

        // Add general headers
        const tr = document.createElement('tr')

        const headerEntries = Object.entries(headers)

        const headerEls = headerEntries.map(([cell, info], i) => {
            const th = document.createElement('th')
            const isMerged = info !== true
            if (isMerged) th.setAttribute('colspan', info.length)
            else th.setAttribute('rowspan', headerRowSize)
            th.innerText = cell
            return th
        }).flat()

        tr.append(...headerEls)

        table.append(tr)


        // Add nested headers
        if (nestedRowInfo.length) {
            const tr = document.createElement('tr')
            tr.classList.add('nested')
            tr.append(...nestedRowInfo.map(cell => {
                const th = document.createElement('th')
                th.innerText = cell
                return th
            }))
            table.append(tr)
        }

        const rows = info.map(cell => {
            const tr = document.createElement('tr')
            tr.append(...headerEntries.map(([header, info]) => {
                return (info === true) ? createCell(cell[header], totals[cell.Modality]?.[header]) : info.map(key => createCell(cell[key], totals[cell.Modality]?.[key]))
            }).flat().filter(o => !!o))
            return tr
        })

        const makeSticky = (row) => {
            row.slice(0, nColsSticky).reduce((acc, cell) => {
                cell.classList.add('sticky')
                cell.style.left = `${acc}px`
                return acc + cell.getBoundingClientRect().width
            }, 0)
        }

        table.append(...rows)


        rows.forEach(r => {
            makeSticky(headerEls)
            makeSticky(Array.from(r.children))
        })
    }

    async function updateTable(tab) {

        table.innerText = ''

        const info = tables.find(({ id }) => id === tab)

        const searchParams = new URLSearchParams(window.location.search)
        searchParams.set('tab', tab)
        window.history.pushState({}, '', `${window.location.pathname}?${searchParams}`)

        console.log('Creating Table', info)

        const { data } = info

        Array.from(tabs.children).forEach(t => {
            if (t.id === tab) t.setAttribute('selected', '')
            else t.removeAttribute('selected')
        })

        addColumnsToTable(table, data, tab === 'overview' ? 1 : nColsSticky)

    }

    tabs.append(...tables.map(({ id, modality }) => {
        const span = document.createElement('span')
        span.innerText = modality
        const div = document.createElement('div')
        div.id = id
        div.onclick = () => updateTable(id)
        div.append(span)
        return div
    }))


    const info = tables.find(({ id }) => id === tab)
    if (!info) {
        console.warn('No table found for', tab)
        tab = tables[0].id
    }
    
    updateTable(tab)

}



// License: MIT - https://opensource.org/licenses/MIT
// Author: Michele Locati <michele@locati.it>
// Source: https://gist.github.com/mlocati/7210513
function fractionToColor(frac, opacity = 1) {
    frac = Math.min(frac, 1) // No more than 1
    const perc = frac * 100
    var r, g, b = 0;
    if (perc < 50) {
        r = 255;
        g = Math.round(5.1 * perc);
    }
    else {
        g = 255;
        r = Math.round(510 - 5.10 * perc);
    }
    var h = r * 0x10000 + g * 0x100 + b * 0x1;
    return '#' + ('000000' + h.toString(16)).slice(-6) + (Math.round(255 * opacity)).toString(16);
}

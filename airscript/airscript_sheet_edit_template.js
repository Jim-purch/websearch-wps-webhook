/**
 * WPS智能表格 AirScript - 通用查询与数据编辑模板（查询+编辑合一版）
 * 
 * 适用于: WPS智能表格 (Excel-style)
 * 
 * 通过webhook调用此脚本，可以：
 * 1. 查询：获取全部工作表、单条件搜索、多条件搜索（支持 _rowNumber 返回）、批量查询、获取区域数据、获取单元格图片
 * 2. 编辑：设置单元格值、批量设置区域值、追加单行/多行数据、在指定位置插入行、更新行、智能追加
 * 
 * 使用方法：
 * 1. 将此脚本复制到WPS智能表格的"开发"功能中
 * 2. 生成脚本令牌(API Token)
 * 3. 通过HTTP POST请求调用webhook接口
 */

// ========== 1. 查询核心方法 ==========

/**
 * 获取全部工作表信息
 */
function getAllSheetsInfo() {
    console.log("开始获取全部工作表信息...")
    try {
        const workbook = Application.ActiveWorkbook
        const sheetsCount = workbook.Sheets.Count

        if (sheetsCount === 0) {
            return { success: true, sheets: [], message: "当前工作簿没有工作表" }
        }

        console.log("找到 " + sheetsCount + " 个工作表")
        const sheets = []

        for (let i = 1; i <= sheetsCount; i++) {
            const sheet = workbook.Sheets.Item(i)
            const usedRange = sheet.UsedRange

            const columns = []
            if (usedRange) {
                const startCol = usedRange.Column
                const colCount = usedRange.Columns.Count
                const headerRow = usedRange.Row

                const nameCounts = {}
                for (let col = 0; col < colCount; col++) {
                    const headerCell = sheet.Cells(headerRow, startCol + col)
                    const headerValue = headerCell.Value
                    let colName = headerValue ? String(headerValue) : columnToLetter(startCol + col)

                    if (nameCounts[colName]) {
                        nameCounts[colName]++
                        colName = `${colName}-${nameCounts[colName]}`
                    } else {
                        nameCounts[colName] = 1
                    }

                    columns.push({
                        name: colName,
                        type: "string",
                        columnIndex: startCol + col,
                        columnLetter: columnToLetter(startCol + col)
                    })
                }
            }

            sheets.push({
                name: sheet.Name,
                index: i,
                usedRange: usedRange ? usedRange.Address() : "",
                rowCount: usedRange ? usedRange.Rows.Count : 0,
                columnCount: usedRange ? usedRange.Columns.Count : 0,
                columns: columns
            })
        }

        console.log("工作表信息获取完成")
        return { success: true, sheets: sheets }
    } catch (error) {
        console.error("获取工作表信息失败: " + error)
        return { success: false, error: String(error), message: "获取工作表信息时发生错误" }
    }
}

/**
 * 在工作表中搜索内容
 */
function searchInSheet(sheetName, searchValue, searchColumn, maxResults) {
    console.log("开始搜索: 表=" + sheetName + ", 值=" + searchValue + ", 列=" + searchColumn)

    if (!sheetName) {
        return { success: false, error: "缺少参数: sheetName", message: "请提供工作表名称" }
    }
    if (!searchValue && searchValue !== 0) {
        return { success: false, error: "缺少参数: searchValue", message: "请提供搜索值" }
    }

    try {
        const workbook = Application.ActiveWorkbook
        let sheet
        try {
            sheet = workbook.Sheets.Item(sheetName)
        } catch (e) {
            const availableSheets = []
            for (let i = 1; i <= workbook.Sheets.Count; i++) {
                availableSheets.push(workbook.Sheets.Item(i).Name)
            }
            return { success: false, error: "未找到工作表: " + sheetName, availableSheets: availableSheets }
        }

        let searchRange
        if (searchColumn && searchColumn > 0) {
            searchRange = sheet.Columns(searchColumn)
        } else {
            searchRange = sheet.UsedRange
        }

        if (!searchRange) {
            return { success: true, sheetName: sheetName, searchValue: searchValue, totalCount: 0, results: [], message: "工作表为空" }
        }

        const results = []
        const limit = Math.min(Math.max(1, maxResults || 100), 500)
        let foundCell = searchRange.Find(String(searchValue), null, "etValues", "etPart")

        if (foundCell) {
            const firstAddress = foundCell.Address()
            do {
                const row = foundCell.Row
                const rowData = {}
                rowData['_rowNumber'] = row // 写入行号属性
                const usedRange = sheet.UsedRange
                const startCol = usedRange.Column
                const endCol = startCol + usedRange.Columns.Count - 1

                for (let col = startCol; col <= endCol; col++) {
                    const cellValue = sheet.Cells(row, col).Value
                    const colLetter = columnToLetter(col)
                    rowData[colLetter] = cellValue
                }

                results.push({
                    row: row,
                    column: foundCell.Column,
                    address: foundCell.Address(),
                    value: foundCell.Value,
                    rowData: rowData
                })

                if (results.length >= limit) {
                    break
                }

                foundCell = searchRange.Find(String(searchValue), foundCell, "etValues", "etPart")
            } while (foundCell && foundCell.Address() !== firstAddress)
        }

        console.log("搜索完成，共找到 " + results.length + " 个匹配项")
        return { success: true, sheetName: sheetName, searchValue: searchValue, searchColumn: searchColumn || "all", totalCount: results.length, results: results }
    } catch (error) {
        console.error("搜索失败: " + error)
        return { success: false, error: String(error), message: "搜索时发生错误" }
    }
}

/**
 * 获取区域数据
 */
function getRangeData(sheetName, rangeAddress, hasHeader) {
    console.log("获取区域数据: 表=" + sheetName + ", 区域=" + rangeAddress)

    if (!sheetName) {
        return { success: false, error: "缺少参数: sheetName", message: "请提供工作表名称" }
    }

    try {
        const workbook = Application.ActiveWorkbook
        let sheet
        try {
            sheet = workbook.Sheets.Item(sheetName)
        } catch (e) {
            const availableSheets = []
            for (let i = 1; i <= workbook.Sheets.Count; i++) {
                availableSheets.push(workbook.Sheets.Item(i).Name)
            }
            return { success: false, error: "未找到工作表: " + sheetName, availableSheets: availableSheets }
        }

        let dataRange
        if (rangeAddress) {
            dataRange = sheet.Range(rangeAddress)
        } else {
            dataRange = sheet.UsedRange
        }

        if (!dataRange) {
            return { success: true, sheetName: sheetName, columns: [], rows: [], message: "指定区域为空" }
        }

        const rowCount = dataRange.Rows.Count
        const colCount = dataRange.Columns.Count
        const startRow = dataRange.Row
        const startCol = dataRange.Column

        console.log("区域 size: " + rowCount + " 行 x " + colCount + " 列")
        const maxRows = Math.min(rowCount, 1000)

        const columns = []
        const useHeader = hasHeader !== false

        if (useHeader && rowCount > 0) {
            for (let col = 0; col < colCount; col++) {
                const headerValue = sheet.Cells(startRow, startCol + col).Value
                columns.push(headerValue || ("列" + (col + 1)))
            }
        } else {
            for (let col = 0; col < colCount; col++) {
                columns.push(columnToLetter(startCol + col))
            }
        }

        const rows = []
        const dataStartRow = useHeader ? 1 : 0

        for (let row = dataStartRow; row < maxRows; row++) {
            const rowData = {}
            rowData['_rowNumber'] = startRow + row // 写入真实行号
            for (let col = 0; col < colCount; col++) {
                const cellValue = sheet.Cells(startRow + row, startCol + col).Value
                rowData[columns[col]] = cellValue
            }
            rows.push(rowData)
        }

        console.log("获取到 " + rows.length + " 行数据")
        return { success: true, sheetName: sheetName, range: dataRange.Address(), columns: columns, rowCount: rows.length, rows: rows }
    } catch (error) {
        console.error("获取数据失败: " + error)
        return { success: false, error: String(error), message: "获取数据时发生错误" }
    }
}

/**
 * 列号转字母
 */
function columnToLetter(colNum) {
    let letter = ""
    let temp
    while (colNum > 0) {
        temp = (colNum - 1) % 26
        letter = String.fromCharCode(temp + 65) + letter
        colNum = Math.floor((colNum - temp - 1) / 26)
    }
    return letter
}

/**
 * 获取工作表中所有单元格图片的URL映射
 */
function getSheetCellImages(sheet) {
    const imageMap = {}
    try {
        const shapes = sheet.Shapes
        if (!shapes || shapes.Count === 0) {
            return imageMap
        }

        console.log("开始获取工作表图片信息, Shapes数量: " + shapes.Count)
        for (let i = 1; i <= shapes.Count; i++) {
            try {
                const shape = shapes.Item(i)
                const topLeftCell = shape.TopLeftCell
                if (!topLeftCell) continue

                const address = topLeftCell.Address().replace(/\$/g, '')
                try {
                    topLeftCell.Select()
                    const imgUrl = Application.ActiveSheet.Shapes.GetActiveShapeImg()
                    if (imgUrl) {
                        imageMap[address] = imgUrl
                    }
                } catch (selectErr) {
                    console.log("获取图片URL失败: " + address)
                }
            } catch (shapeErr) {
                console.log("处理Shape " + i + " 失败: " + shapeErr)
            }
        }
        console.log("图片URL获取完成, 共 " + Object.keys(imageMap).length + " 个")
    } catch (err) {
        console.log("获取Sheet图片信息失败: " + err)
    }
    return imageMap
}

/**
 * 检测单元格值是否为DISPIMG公式
 */
function parseDispImgFormula(value) {
    if (typeof value !== 'string') return null
    const match = value.match(/^=DISPIMG\("([^"]+)",\s*\d+\)$/i)
    if (match) {
        return { imageId: match[1] }
    }
    return null
}

/**
 * 多条件 AND 搜索记录（含 _rowNumber 写入）
 */
function searchMultiCriteria(sheetName, criteria, returnColumns, limitVal, offsetVal) {
    console.log("开始多条件搜索: 表=" + sheetName + ", limit=" + limitVal + ", offset=" + offsetVal)

    if (!sheetName) {
        return { success: false, error: "缺少参数: sheetName" }
    }
    if (!criteria || !Array.isArray(criteria) || criteria.length === 0) {
        return { success: false, error: "缺少参数: criteria" }
    }

    try {
        const workbook = Application.ActiveWorkbook
        let sheet
        try {
            sheet = workbook.Sheets.Item(sheetName)
        } catch (e) {
            const availableSheets = []
            for (let i = 1; i <= workbook.Sheets.Count; i++) {
                availableSheets.push(workbook.Sheets.Item(i).Name)
            }
            return { success: false, error: "未找到工作表: " + sheetName, availableSheets: availableSheets }
        }

        const usedRange = sheet.UsedRange
        if (!usedRange) {
            return { success: true, sheetName: sheetName, totalCount: 0, records: [] }
        }

        const startRow = usedRange.Row
        const startCol = usedRange.Column
        const rowCount = usedRange.Rows.Count
        const colCount = usedRange.Columns.Count

        const columnMap = {}
        const nameCounts = {}
        const headerRow = startRow
        for (let col = 0; col < colCount; col++) {
            const headerValue = sheet.Cells(headerRow, startCol + col).Value
            let colName = headerValue ? String(headerValue) : columnToLetter(startCol + col)

            if (nameCounts[colName]) {
                nameCounts[colName]++
                colName = `${colName}-${nameCounts[colName]}`
            } else {
                nameCounts[colName] = 1
            }

            columnMap[colName] = startCol + col
        }

        const allColumns = Object.keys(columnMap)

        let outputColumns = allColumns
        if (returnColumns && Array.isArray(returnColumns) && returnColumns.length > 0) {
            const validReturnCols = returnColumns.filter(c => columnMap[c])
            if (validReturnCols.length > 0) {
                outputColumns = validReturnCols
            }
        }

        const validCriteria = []
        for (const crit of criteria) {
            const columnName = crit.columnName
            if (!columnName || !columnMap[columnName]) continue
            validCriteria.push({
                columnName: columnName,
                colIndex: columnMap[columnName],
                searchValue: crit.searchValue || "",
                opType: crit.op || "Contains"
            })
        }

        if (validCriteria.length === 0) {
            return { success: false, error: "没有有效的搜索条件" }
        }

        console.log("正在获取图片信息...")
        const imageMap = getSheetCellImages(sheet)
        const hasImages = Object.keys(imageMap).length > 0

        const limit = (typeof limitVal !== 'undefined' && limitVal !== null) ? Number(limitVal) : 100
        const offset = (typeof offsetVal !== 'undefined' && offsetVal !== null) ? Number(offsetVal) : 0
        const records = []
        let truncated = false
        let matchCount = 0

        const firstCrit = validCriteria[0]
        const searchColumn = sheet.Columns(firstCrit.colIndex)
        const searchValue = String(firstCrit.searchValue)

        if (!searchValue || searchValue.trim() === "") {
            return { success: true, sheetName: sheetName, totalCount: 0, records: [] }
        }

        let foundCell = searchColumn.Find(searchValue, null, "etValues", "etPart")
        if (foundCell) {
            const firstAddress = foundCell.Address()
            const seenRows = {}

            do {
                const currentRow = foundCell.Row
                if (currentRow <= headerRow) {
                    foundCell = searchColumn.Find(searchValue, foundCell, "etValues", "etPart")
                    continue
                }
                if (seenRows[currentRow]) {
                    foundCell = searchColumn.Find(searchValue, foundCell, "etValues", "etPart")
                    continue
                }
                seenRows[currentRow] = true

                let matchAll = true
                if (validCriteria.length > 1) {
                    for (let j = 1; j < validCriteria.length; j++) {
                        const crit = validCriteria[j]
                        const cellVal = sheet.Cells(currentRow, crit.colIndex).Value
                        const cellValStr = cellVal === null || cellVal === undefined ? "" : String(cellVal)
                        const critValStr = String(crit.searchValue)

                        if (critValStr !== "" && cellValStr.indexOf(critValStr) === -1) {
                            matchAll = false
                            break
                        }
                    }
                }

                if (matchAll) {
                    matchCount++
                    if (matchCount > offset) {
                        const rowData = {}
                        rowData['_rowNumber'] = currentRow // 写入行号
                        for (const colName of outputColumns) {
                            const idx = columnMap[colName]
                            const cell = sheet.Cells(currentRow, idx)
                            const cellValue = cell.Value

                            let cellAddr = null
                            if (hasImages || parseDispImgFormula(cellValue)) {
                                cellAddr = cell.Address().replace(/\$/g, '')
                            }

                            if (hasImages && cellAddr && imageMap[cellAddr]) {
                                rowData[colName] = { _type: 'image', value: cellValue, imageUrl: imageMap[cellAddr] }
                            } else {
                                const dispImg = parseDispImgFormula(cellValue)
                                if (dispImg) {
                                    rowData[colName] = { _type: 'dispimg', value: cellValue, imageId: dispImg.imageId, cellAddress: cellAddr }
                                } else {
                                    rowData[colName] = cellValue
                                }
                            }
                        }
                        records.push(rowData)
                    }

                    if (records.length >= limit) {
                        truncated = true
                        break
                    }
                }

                foundCell = searchColumn.Find(searchValue, foundCell, "etValues", "etPart")
            } while (foundCell && foundCell.Address() !== firstAddress && records.length < limit)
        }

        console.log("搜索完成，当前批次返回 " + records.length + " 个匹配项" + (truncated ? " (已截断)" : ""))
        return {
            success: true,
            sheetName: sheetName,
            criteriaCount: validCriteria.length,
            totalCount: records.length,
            truncated: truncated,
            maxRecords: limit,
            records: records
        }
    } catch (error) {
        console.error("多条件搜索失败: " + error)
        return { success: false, error: String(error) }
    }
}

/**
 * 内部复用的多条件搜索逻辑 (接收预处理好的Sheet对象和映射，含 _rowNumber 写入)
 */
function searchMultiCriteriaInternal(sheet, criteria, columnMap, allColumns, imageMap, hasImages, headerRow, limitVal) {
    if (!criteria || criteria.length === 0) {
        return { success: false, error: "无搜索条件", records: [] }
    }

    const validCriteria = []
    for (const crit of criteria) {
        const columnName = crit.columnName
        if (!columnName || !columnMap[columnName]) continue
        validCriteria.push({
            columnName: columnName,
            colIndex: columnMap[columnName],
            searchValue: crit.searchValue || "",
            opType: crit.op || "Contains"
        })
    }

    if (validCriteria.length === 0) {
        return { success: false, error: "条件无效", records: [] }
    }

    const records = []
    const MAX_RECORDS = (typeof limitVal !== 'undefined' && limitVal !== null) ? Number(limitVal) : 30

    const firstCrit = validCriteria[0]
    const searchColumn = sheet.Columns(firstCrit.colIndex)
    const searchValue = String(firstCrit.searchValue)

    if (!searchValue || searchValue.trim() === "") {
        return { success: true, records: [], truncated: false }
    }

    let foundCell = searchColumn.Find(searchValue, null, "etValues", "etPart")
    if (foundCell) {
        const firstAddress = foundCell.Address()
        const seenRows = {}

        do {
            const currentRow = foundCell.Row
            if (currentRow <= headerRow) {
                foundCell = searchColumn.Find(searchValue, foundCell, "etValues", "etPart")
                continue
            }
            if (seenRows[currentRow]) {
                foundCell = searchColumn.Find(searchValue, foundCell, "etValues", "etPart")
                continue
            }
            seenRows[currentRow] = true

            let matchAll = true
            if (validCriteria.length > 1) {
                for (let j = 1; j < validCriteria.length; j++) {
                    const crit = validCriteria[j]
                    const cellVal = sheet.Cells(currentRow, crit.colIndex).Value
                    const cellValStr = cellVal === null || cellVal === undefined ? "" : String(cellVal)
                    const critValStr = String(crit.searchValue)

                    if (critValStr !== "" && cellValStr.indexOf(critValStr) === -1) {
                        matchAll = false
                        break
                    }
                }
            }

            if (matchAll) {
                const rowData = {}
                rowData['_rowNumber'] = currentRow // 写入行号
                for (const colName of allColumns) {
                    const colIndex = columnMap[colName]
                    const cell = sheet.Cells(currentRow, colIndex)
                    let cellValue = cell.Value

                    let cellAddr = null
                    if (hasImages || parseDispImgFormula(cellValue)) {
                        cellAddr = cell.Address().replace(/\$/g, '')
                    }

                    if (hasImages && cellAddr && imageMap[cellAddr]) {
                        rowData[colName] = { _type: 'image', value: cellValue, imageUrl: imageMap[cellAddr] }
                    } else {
                        const dispImg = parseDispImgFormula(cellValue)
                        if (dispImg) {
                            rowData[colName] = { _type: 'dispimg', value: cellValue, imageId: dispImg.imageId, cellAddress: cellAddr }
                        } else {
                            rowData[colName] = cellValue
                        }
                    }
                }
                records.push(rowData)
                if (records.length >= MAX_RECORDS) break
            }

            foundCell = searchColumn.Find(searchValue, foundCell, "etValues", "etPart")
        } while (foundCell && foundCell.Address() !== firstAddress && records.length < MAX_RECORDS)
    }

    return {
        success: true,
        records: records,
        truncated: records.length >= MAX_RECORDS
    }
}

/**
 * 获取指定单元格的图片URL
 */
function getImageUrlFromCell(sheetName, cellAddress, cells) {
    console.log("获取图片URL: 表=" + sheetName)
    if (!sheetName) {
        return { success: false, error: "缺少参数: sheetName" }
    }
    if (!cellAddress && (!cells || cells.length === 0)) {
        return { success: false, error: "缺少参数: cellAddress 或 cells" }
    }

    try {
        const workbook = Application.ActiveWorkbook
        let sheet
        try {
            sheet = workbook.Sheets.Item(sheetName)
        } catch (e) {
            return { success: false, error: "未找到工作表: " + sheetName }
        }

        sheet.Activate()
        const imageUrls = {}
        const cellList = cells || [cellAddress]

        for (const addr of cellList) {
            try {
                const cell = sheet.Range(addr)
                cell.Select()
                const imgUrl = Application.ActiveSheet.Shapes.GetActiveShapeImg()
                if (imgUrl) {
                    imageUrls[addr] = imgUrl
                } else {
                    imageUrls[addr] = null
                }
            } catch (cellErr) {
                imageUrls[addr] = null
            }
        }

        return { success: true, sheetName: sheetName, requestedCount: cellList.length, successCount: Object.values(imageUrls).filter(v => v !== null).length, imageUrls: imageUrls }
    } catch (error) {
        console.error("获取图片URL失败: " + error)
        return { success: false, error: String(error) }
    }
}

/**
 * 批量搜索
 */
function searchBatch(sheetName, batchCriteria, returnColumns, limitVal) {
    console.log("开始批量搜索: 表=" + sheetName + ", limit=" + limitVal)

    if (!sheetName) {
        return { success: false, error: "缺少参数: sheetName" }
    }
    if (!batchCriteria || !Array.isArray(batchCriteria) || batchCriteria.length === 0) {
        return { success: false, error: "缺少参数: batchCriteria" }
    }

    try {
        const workbook = Application.ActiveWorkbook
        let sheet
        try {
            sheet = workbook.Sheets.Item(sheetName)
        } catch (e) {
            return { success: false, error: "未找到工作表: " + sheetName }
        }

        const imageMap = getSheetCellImages(sheet)
        const hasImages = Object.keys(imageMap).length > 0

        const usedRange = sheet.UsedRange
        if (!usedRange) {
            return { success: true, sheetName: sheetName, results: [], message: "工作表为空" }
        }

        const startRow = usedRange.Row
        const startCol = usedRange.Column
        const colCount = usedRange.Columns.Count

        const columnMap = {}
        const nameCounts = {}
        const headerRow = startRow

        for (let col = 0; col < colCount; col++) {
            const headerValue = sheet.Cells(headerRow, startCol + col).Value
            let colName = headerValue ? String(headerValue) : columnToLetter(startCol + col)

            if (nameCounts[colName]) {
                nameCounts[colName]++
                colName = `${colName}-${nameCounts[colName]}`
            } else {
                nameCounts[colName] = 1
            }
            columnMap[colName] = startCol + col
        }
        const allColumns = Object.keys(columnMap)

        let outputColumns = allColumns
        if (returnColumns && Array.isArray(returnColumns) && returnColumns.length > 0) {
            const validReturnCols = returnColumns.filter(c => columnMap[c])
            if (validReturnCols.length > 0) {
                outputColumns = validReturnCols
            }
        }

        const batchResults = []
        let totalMatchCount = 0

        for (let i = 0; i < batchCriteria.length; i++) {
            const queryItem = batchCriteria[i]
            const queryId = queryItem.id || ("q_" + i)
            const criteria = queryItem.criteria

            const itemResult = searchMultiCriteriaInternal(sheet, criteria, columnMap, outputColumns, imageMap, hasImages, headerRow, limitVal)

            batchResults.push({
                id: queryId,
                ...itemResult
            })
            totalMatchCount += itemResult.records ? itemResult.records.length : 0
        }

        return { success: true, sheetName: sheetName, totalQueries: batchCriteria.length, totalMatches: totalMatchCount, results: batchResults }
    } catch (err) {
        console.error("批量搜索发生严重错误: " + err)
        return { success: false, error: String(err) }
    }
}

// ========== 2. 编辑核心方法 ==========

/**
 * 获取工作表的列映射
 */
function getColumnMapping(sheet) {
    try {
        const usedRange = sheet.UsedRange
        if (!usedRange) {
            return { success: false, error: "工作表为空", columnMap: {}, headerRow: 1, startCol: 1 }
        }

        const startRow = usedRange.Row
        const startCol = usedRange.Column
        const colCount = usedRange.Columns.Count
        const headerRow = startRow

        const columnMap = {}
        const nameCounts = {}

        for (let col = 0; col < colCount; col++) {
            const headerCell = sheet.Cells(headerRow, startCol + col)
            const headerValue = headerCell.Value
            let colName = headerValue ? String(headerValue) : columnToLetter(startCol + col)

            if (nameCounts[colName]) {
                nameCounts[colName]++
                colName = `${colName}-${nameCounts[colName]}`
            } else {
                nameCounts[colName] = 1
            }

            columnMap[colName] = startCol + col
        }

        return { success: true, columnMap: columnMap, headerRow: headerRow, startCol: startCol, colCount: colCount }
    } catch (error) {
        return { success: false, error: String(error), columnMap: {}, headerRow: 1, startCol: 1 }
    }
}

/**
 * 在表格末尾追加单行数据
 */
function appendRow(sheetName, rowData) {
    console.log("开始追加行: 表=" + sheetName)

    if (!sheetName) {
        return { success: false, error: "缺少参数: sheetName" }
    }
    if (!rowData || typeof rowData !== 'object') {
        return { success: false, error: "缺少参数: rowData" }
    }

    try {
        const workbook = Application.ActiveWorkbook
        let sheet
        try {
            sheet = workbook.Sheets.Item(sheetName)
        } catch (e) {
            return { success: false, error: "未找到工作表: " + sheetName }
        }

        const mappingResult = getColumnMapping(sheet)
        if (!mappingResult.success) return mappingResult

        const columnMap = mappingResult.columnMap
        const usedRange = sheet.UsedRange
        const nextRow = usedRange.Row + usedRange.Rows.Count

        let writtenCells = 0
        const invalidColumns = []

        for (const colName in rowData) {
            if (!columnMap[colName]) {
                invalidColumns.push(colName)
                continue
            }
            const colIndex = columnMap[colName]
            sheet.Cells(nextRow, colIndex).Value = rowData[colName]
            writtenCells++
        }

        return { success: true, sheetName: sheetName, rowIndex: nextRow, writtenCells: writtenCells, invalidColumns: invalidColumns.length > 0 ? invalidColumns : undefined, message: "数据追加成功" }
    } catch (error) {
        console.error("追加行失败: " + error)
        return { success: false, error: String(error) }
    }
}

/**
 * 批量追加多行数据
 */
function appendRows(sheetName, rows) {
    console.log("开始批量追加: 表=" + sheetName)

    if (!sheetName) {
        return { success: false, error: "缺少参数: sheetName" }
    }
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return { success: false, error: "缺少参数: rows" }
    }

    try {
        const workbook = Application.ActiveWorkbook
        let sheet
        try {
            sheet = workbook.Sheets.Item(sheetName)
        } catch (e) {
            return { success: false, error: "未找到工作表: " + sheetName }
        }

        const mappingResult = getColumnMapping(sheet)
        if (!mappingResult.success) return mappingResult

        const columnMap = mappingResult.columnMap
        const usedRange = sheet.UsedRange
        let startRow = usedRange.Row + usedRange.Rows.Count

        const results = []
        let totalWrittenCells = 0

        for (let i = 0; i < rows.length; i++) {
            const rowData = rows[i]
            const currentRow = startRow + i
            let writtenCells = 0
            const invalidColumns = []

            for (const colName in rowData) {
                if (!columnMap[colName]) {
                    invalidColumns.push(colName)
                    continue
                }
                const colIndex = columnMap[colName]
                sheet.Cells(currentRow, colIndex).Value = rowData[colName]
                writtenCells++
                totalWrittenCells++
            }

            results.push({ rowIndex: currentRow, writtenCells: writtenCells, invalidColumns: invalidColumns.length > 0 ? invalidColumns : undefined })
        }

        return { success: true, sheetName: sheetName, totalRows: rows.length, totalWrittenCells: totalWrittenCells, startRow: startRow, endRow: startRow + rows.length - 1, results: results, message: "批量追加成功" }
    } catch (error) {
        console.error("批量追加失败: " + error)
        return { success: false, error: String(error) }
    }
}

/**
 * 在指定位置插入行并填充数据
 */
function insertRow(sheetName, rowIndex, rowData) {
    console.log("开始插入行: 表=" + sheetName + ", 行号=" + rowIndex)

    if (!sheetName) {
        return { success: false, error: "缺少参数: sheetName" }
    }
    if (!rowIndex || rowIndex < 1) {
        return { success: false, error: "无效参数: rowIndex" }
    }
    if (!rowData || typeof rowData !== 'object') {
        return { success: false, error: "缺少参数: rowData" }
    }

    try {
        const workbook = Application.ActiveWorkbook
        let sheet
        try {
            sheet = workbook.Sheets.Item(sheetName)
        } catch (e) {
            return { success: false, error: "未找到工作表: " + sheetName }
        }

        const mappingResult = getColumnMapping(sheet)
        if (!mappingResult.success) return mappingResult

        const columnMap = mappingResult.columnMap
        const targetRange = sheet.Rows(rowIndex)
        targetRange.Insert()

        let writtenCells = 0
        const invalidColumns = []

        for (const colName in rowData) {
            if (!columnMap[colName]) {
                invalidColumns.push(colName)
                continue
            }
            const colIndex = columnMap[colName]
            sheet.Cells(rowIndex, colIndex).Value = rowData[colName]
            writtenCells++
        }

        return { success: true, sheetName: sheetName, rowIndex: rowIndex, writtenCells: writtenCells, invalidColumns: invalidColumns.length > 0 ? invalidColumns : undefined, message: "行插入成功" }
    } catch (error) {
        console.error("插入行失败: " + error)
        return { success: false, error: String(error) }
    }
}

/**
 * 设置单个单元格的值
 */
function setCellValue(sheetName, cellAddress, value) {
    console.log("设置单元格值: 表=" + sheetName + ", 单元格=" + cellAddress + ", 值=" + value)

    if (!sheetName) {
        return { success: false, error: "缺少参数: sheetName" }
    }
    if (!cellAddress) {
        return { success: false, error: "缺少参数: cellAddress" }
    }

    try {
        const workbook = Application.ActiveWorkbook
        let sheet
        try {
            sheet = workbook.Sheets.Item(sheetName)
        } catch (e) {
            return { success: false, error: "未找到工作表: " + sheetName }
        }

        const cell = sheet.Range(cellAddress)
        cell.Value = value

        return { success: true, sheetName: sheetName, cellAddress: cellAddress, value: value, message: "单元格更新成功" }
    } catch (error) {
        console.error("设置单元格值失败: " + error)
        return { success: false, error: String(error) }
    }
}

/**
 * 批量设置区域的值
 */
function setRangeValues(sheetName, rangeAddress, values) {
    console.log("设置区域值: 表=" + sheetName + ", 区域=" + rangeAddress)

    if (!sheetName) {
        return { success: false, error: "缺少参数: sheetName" }
    }
    if (!rangeAddress) {
        return { success: false, error: "缺少参数: rangeAddress" }
    }
    if (values === undefined || values === null) {
        return { success: false, error: "缺少参数: values" }
    }

    try {
        const workbook = Application.ActiveWorkbook
        let sheet
        try {
            sheet = workbook.Sheets.Item(sheetName)
        } catch (e) {
            return { success: false, error: "未找到工作表: " + sheetName }
        }

        const range = sheet.Range(rangeAddress)
        range.Value = values

        let cellCount = 0
        if (Array.isArray(values)) {
            cellCount = values.reduce((sum, row) => sum + (Array.isArray(row) ? row.length : 1), 0)
        } else {
            cellCount = range.Count
        }

        return { success: true, sheetName: sheetName, rangeAddress: rangeAddress, cellCount: cellCount, message: "区域更新成功" }
    } catch (error) {
        console.error("设置区域值失败: " + error)
        return { success: false, error: String(error) }
    }
}

/**
 * 根据列名设置指定行的数据
 */
function updateRow(sheetName, rowIndex, rowData) {
    console.log("更新行数据: 表=" + sheetName + ", 行号=" + rowIndex)

    if (!sheetName) {
        return { success: false, error: "缺少参数: sheetName" }
    }
    if (!rowIndex || rowIndex < 1) {
        return { success: false, error: "无效参数: rowIndex" }
    }
    if (!rowData || typeof rowData !== 'object') {
        return { success: false, error: "缺少参数: rowData" }
    }

    try {
        const workbook = Application.ActiveWorkbook
        let sheet
        try {
            sheet = workbook.Sheets.Item(sheetName)
        } catch (e) {
            return { success: false, error: "未找到工作表: " + sheetName }
        }

        const mappingResult = getColumnMapping(sheet)
        if (!mappingResult.success) return mappingResult

        const columnMap = mappingResult.columnMap
        let writtenCells = 0
        const invalidColumns = []

        for (const colName in rowData) {
            if (!columnMap[colName]) {
                invalidColumns.push(colName)
                continue
            }
            const colIndex = columnMap[colName]
            sheet.Cells(rowIndex, colIndex).Value = rowData[colName]
            writtenCells++
        }

        return { success: true, sheetName: sheetName, rowIndex: rowIndex, writtenCells: writtenCells, invalidColumns: invalidColumns.length > 0 ? invalidColumns : undefined, message: "行更新成功" }
    } catch (error) {
        console.error("更新行失败: " + error)
        return { success: false, error: String(error) }
    }
}

/**
 * 批量删除指定行
 */
function deleteRows(sheetName, rowNumbers) {
    console.log("删除行数据: 表=" + sheetName + ", 行数=" + (rowNumbers ? rowNumbers.length : 0))

    if (!sheetName) {
        return { success: false, error: "缺少参数: sheetName" }
    }
    if (!rowNumbers || !Array.isArray(rowNumbers)) {
        return { success: false, error: "缺少参数: rowNumbers 必须为数组" }
    }

    try {
        const workbook = Application.ActiveWorkbook
        let sheet
        try {
            sheet = workbook.Sheets.Item(sheetName)
        } catch (e) {
            return { success: false, error: "未找到工作表: " + sheetName }
        }

        // 按降序排序行号，避免前面的行删除影响后面行的索引
        const sortedRowNumbers = [...rowNumbers].sort((a, b) => b - a)
        let deletedCount = 0

        for (let i = 0; i < sortedRowNumbers.length; i++) {
            const rowIndex = sortedRowNumbers[i]
            if (rowIndex && rowIndex >= 1) {
                sheet.Rows(rowIndex).Delete()
                deletedCount++
            }
        }

        return { success: true, sheetName: sheetName, deletedCount: deletedCount, message: "行删除成功" }
    } catch (error) {
        console.error("删除行失败: " + error)
        return { success: false, error: String(error) }
    }
}

/**
 * 智能追加数据
 */
function smartAppend(baseName, rowData, rowLimit) {
    console.log("开始智能追加: 基础名=" + baseName)
    if (!baseName) return { success: false, error: "缺少参数: sheetBaseName" }
    rowLimit = rowLimit || 2000

    try {
        const workbook = Application.ActiveWorkbook
        let currentSheet = null
        let currentIndex = 1

        while (true) {
            let sheetName = baseName + "-" + currentIndex
            let nextSheetName = baseName + "-" + (currentIndex + 1)
            let sheet

            try {
                sheet = workbook.Sheets.Item(sheetName)
            } catch (e) {
                sheet = null
            }

            if (!sheet) {
                if (currentIndex === 1) {
                    try {
                        sheet = workbook.Sheets.Add(null, workbook.Sheets.Item(workbook.Sheets.Count))
                        sheet.Name = sheetName
                        let col = 1
                        for (let key in rowData) {
                            sheet.Cells(1, col).Value = key
                            col++
                        }
                        currentSheet = sheet
                        break
                    } catch (createErr) {
                        return { success: false, error: "创建表格失败: " + createErr }
                    }
                } else {
                    let prevSheet = workbook.Sheets.Item(baseName + "-" + (currentIndex - 1))
                    try {
                        sheet = workbook.Sheets.Add(null, workbook.Sheets.Item(workbook.Sheets.Count))
                        sheet.Name = sheetName
                        prevSheet.Rows("1:1").Copy(sheet.Rows("1:1"))
                        currentSheet = sheet
                        break
                    } catch (createErr) {
                        return { success: false, error: "创建新表失败: " + createErr }
                    }
                }
            }

            let usedRange = sheet.UsedRange
            if (usedRange.Rows.Count >= rowLimit) {
                try {
                    workbook.Sheets.Item(nextSheetName)
                    currentIndex++
                    continue
                } catch (e) {
                    currentIndex++
                    continue
                }
            } else {
                currentSheet = sheet
                break
            }
        }

        return appendRow(currentSheet.Name, rowData)
    } catch (error) {
        console.error("智能追加失败: " + error)
        return { success: false, error: String(error) }
    }
}

// ========== 3. 执行逻辑分发 ==========
console.log("=== AirScript 智能表格通用数据API ===")

var argv = Context.argv || {}
var action = argv.action || "getAll"

console.log("执行操作: " + action)
console.log("参数: " + JSON.stringify(argv))

var result

// 查询 actions
if (action === "getAll") {
    result = getAllSheetsInfo()
} else if (action === "search") {
    result = searchInSheet(argv.sheetName, argv.searchValue, argv.searchColumn, argv.maxResults)
} else if (action === "searchMulti") {
    result = searchMultiCriteria(argv.sheetName, argv.criteria, argv.returnColumns, argv.limit, argv.offset)
} else if (action === "getData") {
    result = getRangeData(argv.sheetName, argv.range, argv.hasHeader)
} else if (action === "getImageUrl") {
    result = getImageUrlFromCell(argv.sheetName, argv.cellAddress, argv.cells)
} else if (action === "searchBatch") {
    result = searchBatch(argv.sheetName, argv.batchCriteria, argv.returnColumns, argv.limit)
} 
// 编辑 actions
else if (action === "appendRow") {
    result = appendRow(argv.sheetName, argv.rowData)
} else if (action === "appendRows") {
    result = appendRows(argv.sheetName, argv.rows)
} else if (action === "insertRow") {
    result = insertRow(argv.sheetName, argv.rowIndex, argv.rowData)
} else if (action === "setCellValue") {
    result = setCellValue(argv.sheetName, argv.cellAddress, argv.value)
} else if (action === "setRangeValues") {
    result = setRangeValues(argv.sheetName, argv.rangeAddress, argv.values)
} else if (action === "updateRow") {
    result = updateRow(argv.sheetName, argv.rowIndex, argv.rowData)
} else if (action === "deleteRows") {
    result = deleteRows(argv.sheetName, argv.rowNumbers)
} else if (action === "smartAppend") {
    result = smartAppend(argv.sheetBaseName, argv.rowData, argv.rowLimit)
} else {
    result = {
        success: false,
        error: "未知操作: " + action,
        message: "支持的操作: getAll, search, searchMulti, searchBatch, getData, getImageUrl, appendRow, appendRows, insertRow, setCellValue, setRangeValues, updateRow, deleteRows, smartAppend"
    }
}

console.log("操作完成: " + (result.success ? "成功" : "失败"))

var jsonResult = JSON.stringify(result)
console.log("__RESULT_JSON_START__")
var chunkSize = 500
for (var i = 0; i < jsonResult.length; i += chunkSize) {
    console.log("__CHUNK_" + Math.floor(i / chunkSize) + "__:" + jsonResult.substring(i, i + chunkSize))
}
console.log("__RESULT_JSON_END__")

JSON.stringify(result)

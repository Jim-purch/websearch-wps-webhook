/**
 * WPS智能表格 AirScript - 通用数据查询模板
 * 
 * 适用于: WPS智能表格 (Excel-style)
 * 
 * 通过webhook调用此脚本，可以：
 * 1. 获取工作簿中全部工作表列表
 * 2. 在指定工作表中搜索包含特定值的单元格
 * 3. 获取指定区域的数据
 * 
 * 使用方法：
 * 1. 将此脚本复制到WPS智能表格的"开发"功能中
 * 2. 生成脚本令牌(API Token)
 * 3. 通过HTTP POST请求调用webhook接口
 * 
 * ===== 请求示例 =====
 * 
 * 获取全部工作表:
 * POST https://www.kdocs.cn/api/v3/ide/file/:file_id/script/:script_id/sync_task
 * Header: AirScript-Token: <your_token>
 * Body: {"Context":{"argv":{"action":"getAll"}}}
 * 
 * 搜索内容:
 * Body: {"Context":{"argv":{
 *   "action":"search",
 *   "sheetName":"Sheet1",
 *   "searchValue":"搜索值",
 *   "searchColumn": 1
 * }}}
 * 
 * 获取区域数据:
 * Body: {"Context":{"argv":{
 *   "action":"getData",
 *   "sheetName":"Sheet1",
 *   "range":"A1:E100",
 *   "hasHeader": true
 * }}}
 */

/**
 * 获取全部工作表信息
 * @returns {Object} 包含所有工作表名称的对象
 */
function getAllSheetsInfo() {
    console.log("开始获取全部工作表信息...")

    try {
        const workbook = Application.ActiveWorkbook
        const sheetsCount = workbook.Sheets.Count

        if (sheetsCount === 0) {
            return {
                success: true,
                sheets: [],
                message: "当前工作簿没有工作表"
            }
        }

        console.log("找到 " + sheetsCount + " 个工作表")

        const sheets = []

        for (let i = 1; i <= sheetsCount; i++) {
            const sheet = workbook.Sheets.Item(i)
            const usedRange = sheet.UsedRange

            // 获取列信息（从第一行解析表头）
            const columns = []
            if (usedRange) {
                const startCol = usedRange.Column
                const colCount = usedRange.Columns.Count
                const headerRow = usedRange.Row  // 通常是第1行

                const nameCounts = {}
                for (let col = 0; col < colCount; col++) {
                    const headerCell = sheet.Cells(headerRow, startCol + col)
                    const headerValue = headerCell.Value
                    // 使用表头值作为列名，如果为空则使用列字母
                    let colName = headerValue ? String(headerValue) : columnToLetter(startCol + col)

                    // 处理重复列名: 自动添加 -N 后缀
                    if (nameCounts[colName]) {
                        nameCounts[colName]++
                        colName = `${colName}-${nameCounts[colName]}`
                    } else {
                        nameCounts[colName] = 1
                    }

                    columns.push({
                        name: colName,
                        type: "string",  // 智能表格没有明确的类型定义
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
                columns: columns  // 添加列信息
            })
        }

        console.log("工作表信息获取完成")

        return {
            success: true,
            sheets: sheets
        }

    } catch (error) {
        console.error("获取工作表信息失败: " + error)
        return {
            success: false,
            error: String(error),
            message: "获取工作表信息时发生错误"
        }
    }
}

/**
 * 在工作表中搜索内容
 * @param {string} sheetName - 工作表名称
 * @param {string} searchValue - 搜索值
 * @param {number} searchColumn - 限定搜索的列号(可选，不指定则搜索整表)
 * @param {number} maxResults - 最大返回结果数(默认100)
 * @returns {Object} 包含匹配结果的对象
 */
function searchInSheet(sheetName, searchValue, searchColumn, maxResults) {
    console.log("开始搜索: 表=" + sheetName + ", 值=" + searchValue + ", 列=" + searchColumn)

    // 参数验证
    if (!sheetName) {
        return {
            success: false,
            error: "缺少参数: sheetName",
            message: "请提供工作表名称"
        }
    }

    if (!searchValue && searchValue !== 0) {
        return {
            success: false,
            error: "缺少参数: searchValue",
            message: "请提供搜索值"
        }
    }

    try {
        const workbook = Application.ActiveWorkbook
        let sheet

        try {
            sheet = workbook.Sheets.Item(sheetName)
        } catch (e) {
            // 列出可用的工作表
            const availableSheets = []
            for (let i = 1; i <= workbook.Sheets.Count; i++) {
                availableSheets.push(workbook.Sheets.Item(i).Name)
            }
            return {
                success: false,
                error: "未找到工作表: " + sheetName,
                availableSheets: availableSheets
            }
        }

        // 确定搜索范围
        let searchRange
        if (searchColumn && searchColumn > 0) {
            // 搜索指定列
            searchRange = sheet.Columns(searchColumn)
        } else {
            // 搜索整个已使用区域
            searchRange = sheet.UsedRange
        }

        if (!searchRange) {
            return {
                success: true,
                sheetName: sheetName,
                searchValue: searchValue,
                totalCount: 0,
                results: [],
                message: "工作表为空"
            }
        }

        // 使用Find方法搜索
        const results = []
        const limit = Math.min(Math.max(1, maxResults || 100), 500)
        let foundCell = searchRange.Find(String(searchValue), null, "etValues", "etPart") // LookIn="etValues", LookAt="etPart"(部分匹配)

        if (foundCell) {
            const firstAddress = foundCell.Address()

            do {
                // 获取该行的所有数据
                const row = foundCell.Row
                const rowData = {}
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

        return {
            success: true,
            sheetName: sheetName,
            searchValue: searchValue,
            searchColumn: searchColumn || "all",
            totalCount: results.length,
            results: results
        }

    } catch (error) {
        console.error("搜索失败: " + error)
        return {
            success: false,
            error: String(error),
            message: "搜索时发生错误"
        }
    }
}

/**
 * 获取指定区域的数据
 * @param {string} sheetName - 工作表名称
 * @param {string} rangeAddress - 区域地址(如 "A1:E100")，不指定则使用UsedRange
 * @param {boolean} hasHeader - 第一行是否为表头(默认true)
 * @returns {Object} 包含数据的对象
 */
function getRangeData(sheetName, rangeAddress, hasHeader) {
    console.log("获取区域数据: 表=" + sheetName + ", 区域=" + rangeAddress)

    if (!sheetName) {
        return {
            success: false,
            error: "缺少参数: sheetName",
            message: "请提供工作表名称"
        }
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
            return {
                success: false,
                error: "未找到工作表: " + sheetName,
                availableSheets: availableSheets
            }
        }

        // 确定数据范围
        let dataRange
        if (rangeAddress) {
            dataRange = sheet.Range(rangeAddress)
        } else {
            dataRange = sheet.UsedRange
        }

        if (!dataRange) {
            return {
                success: true,
                sheetName: sheetName,
                columns: [],
                rows: [],
                message: "指定区域为空"
            }
        }

        const rowCount = dataRange.Rows.Count
        const colCount = dataRange.Columns.Count
        const startRow = dataRange.Row
        const startCol = dataRange.Column

        console.log("区域大小: " + rowCount + " 行 x " + colCount + " 列")

        // 限制返回数据量
        const maxRows = Math.min(rowCount, 1000)

        // 获取表头
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

        // 获取数据行
        const rows = []
        const dataStartRow = useHeader ? 1 : 0

        for (let row = dataStartRow; row < maxRows; row++) {
            const rowData = {}
            for (let col = 0; col < colCount; col++) {
                const cellValue = sheet.Cells(startRow + row, startCol + col).Value
                rowData[columns[col]] = cellValue
            }
            rows.push(rowData)
        }

        console.log("获取到 " + rows.length + " 行数据")

        return {
            success: true,
            sheetName: sheetName,
            range: dataRange.Address(),
            columns: columns,
            rowCount: rows.length,
            rows: rows
        }

    } catch (error) {
        console.error("获取数据失败: " + error)
        return {
            success: false,
            error: String(error),
            message: "获取数据时发生错误"
        }
    }
}

/**
 * 列号转字母
 * @param {number} colNum - 列号(1-based)
 * @returns {string} 列字母
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
 * 清理搜索值：去除回车、空格、"-"、"."，以及最开始的"0"，再转小写
 * @param {string} value - 原始值
 * @returns {string} 清理后的值
 */
function cleanSearchValue(value) {
    if (value === null || value === undefined) return ""
    return String(value)
        .replace(/[\r\n\s\-\.]/g, '')
        .replace(/^0+/, '')
        .toLowerCase()
}

/**
 * 获取工作表中所有单元格图片的URL映射
 * @param {Object} sheet - 工作表对象
 * @returns {Object} 单元格地址到图片URL的映射 {address: url}
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

                // 获取图片所在的左上角单元格
                const topLeftCell = shape.TopLeftCell
                if (!topLeftCell) continue

                const address = topLeftCell.Address().replace(/\$/g, '')

                // 尝试通过选择单元格并获取图片URL
                try {
                    topLeftCell.Select()
                    const imgUrl = Application.ActiveSheet.Shapes.GetActiveShapeImg()
                    if (imgUrl) {
                        imageMap[address] = imgUrl
                        console.log("获取到图片URL: " + address + " -> " + imgUrl.substring(0, 50) + "...")
                    }
                } catch (selectErr) {
                    // GetActiveShapeImg可能在某些情况下失败，跳过
                    console.log("获取图片URL失败(selectErr): " + address)
                }
            } catch (shapeErr) {
                // 跳过无法处理的shape
                console.log("处理Shape " + i + " 失败: " + shapeErr)
            }
        }

        console.log("图片URL获取完成, 共获取 " + Object.keys(imageMap).length + " 个")

    } catch (err) {
        console.log("获取Sheet图片信息失败: " + err)
    }

    return imageMap
}

/**
 * 检测单元格值是否为DISPIMG公式
 * @param {any} value - 单元格值
 * @returns {Object|null} 如果是DISPIMG返回 {imageId}, 否则返回null
 */
function parseDispImgFormula(value) {
    if (typeof value !== 'string') return null

    // 匹配 =DISPIMG("ID_xxx",1) 格式
    const match = value.match(/^=DISPIMG\("([^"]+)",\s*\d+\)$/i)
    if (match) {
        return { imageId: match[1] }
    }
    return null
}
/**
 * 多条件 AND 搜索记录（智能表格版本 - 优化版）
 * 使用 Excel Find 方法加速搜索，而不是逐行遍历
 * @param {string} sheetName - 工作表名称
 * @param {Array} criteria - 条件数组，每个条件为 {columnName, searchValue, op}
 * @param {Array} returnColumns - (可选) 指定返回的列名数组，如果为空则返回所有列
 * @returns {Object} 包含匹配记录的对象
 */
function searchMultiCriteria(sheetName, criteria, returnColumns) {
    console.log("开始多条件搜索: 表=" + sheetName + ", 条件数=" + (criteria ? criteria.length : 0))

    // 参数验证
    if (!sheetName) {
        return {
            success: false,
            error: "缺少参数: sheetName",
            message: "请提供工作表名称"
        }
    }

    if (!criteria || !Array.isArray(criteria) || criteria.length === 0) {
        return {
            success: false,
            error: "缺少参数: criteria",
            message: "请提供至少一个搜索条件"
        }
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
            return {
                success: false,
                error: "未找到工作表: " + sheetName,
                availableSheets: availableSheets
            }
        }

        const usedRange = sheet.UsedRange
        if (!usedRange) {
            return {
                success: true,
                sheetName: sheetName,
                totalCount: 0,
                records: [],
                message: "工作表为空"
            }
        }

        const startRow = usedRange.Row
        const startCol = usedRange.Column
        const rowCount = usedRange.Rows.Count
        const colCount = usedRange.Columns.Count

        // 获取表头（第一行）建立列名到列号的映射
        const columnMap = {}
        const nameCounts = {}
        const headerRow = startRow
        for (let col = 0; col < colCount; col++) {
            const headerValue = sheet.Cells(headerRow, startCol + col).Value
            let colName = headerValue ? String(headerValue) : columnToLetter(startCol + col)

            // 处理重复列名，确保与 getAllSheetsInfo 逻辑一致
            if (nameCounts[colName]) {
                nameCounts[colName]++
                colName = `${colName}-${nameCounts[colName]}`
            } else {
                nameCounts[colName] = 1
            }

            columnMap[colName] = startCol + col
        }

        // 获取所有表头名称
        const allColumns = Object.keys(columnMap)

        // 确定要返回的列
        let outputColumns = allColumns
        if (returnColumns && Array.isArray(returnColumns) && returnColumns.length > 0) {
            // 过滤只返回存在的列
            const validReturnCols = returnColumns.filter(c => columnMap[c])
            if (validReturnCols.length > 0) {
                outputColumns = validReturnCols
            }
        }

        // 验证条件中的列名并收集有效条件
        const validCriteria = []
        const criteriaDescriptions = []
        for (const crit of criteria) {
            const columnName = crit.columnName
            if (!columnName) continue

            if (!columnMap[columnName]) {
                return {
                    success: false,
                    error: "未找到列: " + columnName,
                    message: "请检查列名称是否正确",
                    sheetName: sheetName,
                    availableColumns: allColumns
                }
            }

            const opType = crit.op || "Contains"
            const searchValue = crit.searchValue || ""
            // 如果前端提供了清理后的值，直接使用；否则在后端清理
            const searchValueClean = crit.searchValueClean || cleanSearchValue(searchValue)
            validCriteria.push({
                columnName: columnName,
                colIndex: columnMap[columnName],
                searchValue: searchValue,  // 原始值，用于 Find 搜索
                searchValueClean: searchValueClean,  // 清理后的值，用于匹配验证
                opType: opType
            })
            criteriaDescriptions.push(columnName + " " + opType + " '" + searchValue + "'")
        }

        if (validCriteria.length === 0) {
            return {
                success: false,
                error: "没有有效的搜索条件",
                message: "请提供至少一个有效的搜索条件"
            }
        }

        console.log("搜索条件: " + criteriaDescriptions.join(" AND "))

        // 获取工作表中的图片URL映射
        console.log("正在获取图片信息...")
        const imageMap = getSheetCellImages(sheet)
        const hasImages = Object.keys(imageMap).length > 0
        console.log("图片信息获取完成, 共 " + Object.keys(imageMap).length + " 张图片")

        // 使用内存遍历替代 Find 方法以支持清洗后的模糊匹配
        // 原 Find 方法无法处理 "3FE6412332" 匹配 "3FE-64-12332" 的情况
        console.log("开始内存遍历搜索(优化版)...")

        const records = []
        const MAX_RECORDS = 100
        let truncated = false

        // 确定数据范围（跳过表头）
        const dataStartRow = headerRow + 1
        const dataEndRow = startRow + rowCount - 1

        if (dataStartRow <= dataEndRow) {
            const firstCrit = validCriteria[0]
            const firstColIndex = firstCrit.colIndex
            const firstColLetter = columnToLetter(firstColIndex)

            // 获取第一列的数据到内存
            // 注意：如果数据量极大，这可能会消耗较多内存。但在WPS JS环境中通常支持数万行。
            const rangeAddress = `${firstColLetter}${dataStartRow}:${firstColLetter}${dataEndRow}`
            let colValues = sheet.Range(rangeAddress).Value

            // 确保是二维数组格式 (以防Range只包含一个单元格)
            if (!Array.isArray(colValues)) {
                colValues = [[colValues]]
            } else if (colValues.length > 0 && !Array.isArray(colValues[0])) {
                // 防御性处理：有些环境 Range.Value 可能是 [v1, v2] 而不是 [[v1], [v2]]
                // 通常 JSA 返回 2D 数组，但处理一下更安全
                // 这里实际上通常不会发生，除非是一行多列，但我们是取一列多行
            }

            // 遍历内存中的第一列数据
            for (let i = 0; i < colValues.length; i++) {
                // 安全获取单元格值
                const rowVal = colValues[i]
                const cellVal = Array.isArray(rowVal) ? rowVal[0] : rowVal

                const currentRow = dataStartRow + i

                // 检查第一个条件
                const cellValClean = cleanSearchValue(cellVal)
                const critValClean = firstCrit.searchValueClean

                let match = false
                if (firstCrit.opType === "Equals") {
                    match = cellValClean === critValClean
                } else {
                    // Contains
                    if (critValClean === "") {
                        match = true
                    } else {
                        match = cellValClean.indexOf(critValClean) !== -1
                    }
                }

                if (match) {
                    // 第一个条件匹配，检查其他条件
                    // 此时再去具体行读取其他列数据进行验证s
                    let matchAll = true

                    if (validCriteria.length > 1) {
                        for (let j = 1; j < validCriteria.length; j++) {
                            const crit = validCriteria[j]
                            const val = sheet.Cells(currentRow, crit.colIndex).Value
                            const valClean = cleanSearchValue(val)

                            if (crit.opType === "Equals") {
                                if (valClean !== crit.searchValueClean) { matchAll = false; break }
                            } else {
                                // Contains
                                if (crit.searchValueClean !== "" && valClean.indexOf(crit.searchValueClean) === -1) { matchAll = false; break }
                            }
                        }
                    }

                    if (matchAll) {
                        // 所有条件匹配，收集整行数据
                        const rowData = {}
                        for (const colName of outputColumns) {
                            const idx = columnMap[colName]
                            const cell = sheet.Cells(currentRow, idx)
                            const cellValue = cell.Value

                            // 只有在需要图片时才获取地址，减少开销
                            let cellAddr = null
                            if (hasImages || parseDispImgFormula(cellValue)) {
                                cellAddr = cell.Address().replace(/\$/g, '')
                            }

                            if (hasImages && cellAddr && imageMap[cellAddr]) {
                                rowData[colName] = {
                                    _type: 'image',
                                    value: cellValue,
                                    imageUrl: imageMap[cellAddr]
                                }
                            } else {
                                const dispImg = parseDispImgFormula(cellValue)
                                if (dispImg) {
                                    rowData[colName] = {
                                        _type: 'dispimg',
                                        value: cellValue,
                                        imageId: dispImg.imageId,
                                        cellAddress: cellAddr
                                    }
                                } else {
                                    rowData[colName] = cellValue
                                }
                            }
                        }
                        records.push(rowData)

                        if (records.length >= MAX_RECORDS) {
                            truncated = true
                            console.log("已达到最大记录限制 " + MAX_RECORDS + " 条，停止搜索")
                            break
                        }
                    }
                }
            }
        }

        console.log("多条件搜索完成，共找到 " + records.length + " 条匹配记录" + (truncated ? "(已截断)" : ""))

        return {
            success: true,
            sheetName: sheetName,
            criteriaCount: validCriteria.length,
            criteriaDescription: criteriaDescriptions.join(" AND "),
            totalCount: records.length,
            truncated: truncated,
            maxRecords: MAX_RECORDS,
            records: records
        }

    } catch (error) {
        console.error("多条件搜索失败: " + error)
        return {
            success: false,
            error: String(error),
            message: "搜索时发生错误"
        }
    }
}

// ========== 主执行逻辑 ==========
console.log("=== AirScript 智能表格数据API ===")

// 获取传入的参数
var argv = Context.argv || {}
var action = argv.action || "getAll"

console.log("执行操作: " + action)
console.log("参数: " + JSON.stringify(argv))

var result

if (action === "getAll") {
    result = getAllSheetsInfo()
} else if (action === "search") {
    result = searchInSheet(argv.sheetName, argv.searchValue, argv.searchColumn, argv.maxResults)
} else if (action === "searchMulti") {
    // 多条件 AND 搜索
    result = searchMultiCriteria(argv.sheetName, argv.criteria, argv.returnColumns)
} else if (action === "getData") {
    result = getRangeData(argv.sheetName, argv.range, argv.hasHeader)
} else if (action === "getImageUrl") {
    // 获取单元格图片URL
    result = getImageUrlFromCell(argv.sheetName, argv.cellAddress, argv.cells)
} else if (action === "searchBatch") {
    // 批量搜索
    result = searchBatch(argv.sheetName, argv.batchCriteria)
} else {
    result = {
        success: false,
        error: "未知操作: " + action,
        message: "支持的操作: getAll, search, searchMulti, searchBatch, getData, getImageUrl"
    }
}

/**
 * 批量搜索 (支持多行查询)
 * @param {string} sheetName - 工作表名称
 * @param {Array} batchCriteria - 批量查询条件数组，每个元素为 {id: string, criteria: Array}
 * @returns {Object} 包含所有查询结果的对象
 */
function searchBatch(sheetName, batchCriteria) {
    console.log("开始批量搜索: 表=" + sheetName + ", 查询行数=" + (batchCriteria ? batchCriteria.length : 0))

    if (!sheetName) {
        return {
            success: false,
            error: "缺少参数: sheetName",
            message: "请提供工作表名称"
        }
    }

    if (!batchCriteria || !Array.isArray(batchCriteria) || batchCriteria.length === 0) {
        return {
            success: false,
            error: "缺少参数: batchCriteria",
            message: "请提供批量查询条件"
        }
    }

    const batchResults = []
    let totalMatchCount = 0

    // 为了性能考虑，首先获取工作表对象和预加载图片信息
    try {
        const workbook = Application.ActiveWorkbook
        let sheet
        try {
            sheet = workbook.Sheets.Item(sheetName)
        } catch (e) {
            return {
                success: false,
                error: "未找到工作表: " + sheetName
            }
        }

        // 预加载图片映射（如果需要）
        // 注意：如果批量查询量很大，这里可能需要优化，目前复用现有逻辑
        const imageMap = getSheetCellImages(sheet)
        const hasImages = Object.keys(imageMap).length > 0

        // 获取表头映射，避免每次查询都重新解析
        const usedRange = sheet.UsedRange
        if (!usedRange) {
            return {
                success: true,
                sheetName: sheetName,
                results: [],
                message: "工作表为空"
            }
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

        // 遍历每一个查询请求
        for (let i = 0; i < batchCriteria.length; i++) {
            const queryItem = batchCriteria[i]
            const queryId = queryItem.id || ("q_" + i)
            const criteria = queryItem.criteria

            // 复用 searchMultiCriteria 的核心逻辑，但为了避免重复打开Sheet和解析Header，
            // 最好是提取核心搜索逻辑。但鉴于AirScript限制，我们这里简化处理：
            // 直接调用优化的内部搜索逻辑（这里需要稍微重构 searchMultiCriteria 以便复用，
            // 或者简单地在这里实现类似的 Find 逻辑）

            // 简单起见，且为了保证一致性，我们在这里实现一个简化的 searchMultiCriteria 变体，
            // 复用已经获取的 resources (sheet, imageMap, columnMap)

            const itemResult = searchMultiCriteriaInternal(sheet, criteria, columnMap, allColumns, imageMap, hasImages, headerRow)

            batchResults.push({
                id: queryId,
                ...itemResult
            })

            totalMatchCount += itemResult.records ? itemResult.records.length : 0

            // Log 进度
            if ((i + 1) % 10 === 0) {
                console.log("已处理 " + (i + 1) + "/" + batchCriteria.length + " 个查询")
            }
        }

        console.log("批量搜索完成，总匹配记录: " + totalMatchCount)

        return {
            success: true,
            sheetName: sheetName,
            totalQueries: batchCriteria.length,
            totalMatches: totalMatchCount,
            results: batchResults
        }

    } catch (err) {
        console.error("批量搜索发生严重错误: " + err)
        return {
            success: false,
            error: String(err),
            message: "批量搜索执行失败"
        }
    }
}

/**
 * 内部复用的多条件搜索逻辑 (接收预处理好的Sheet对象和映射)
 */
function searchMultiCriteriaInternal(sheet, criteria, columnMap, allColumns, imageMap, hasImages, headerRow) {
    if (!criteria || criteria.length === 0) {
        return { success: false, error: "无搜索条件", records: [] }
    }

    // 验证列和条件
    const validCriteria = []
    for (const crit of criteria) {
        const columnName = crit.columnName
        if (!columnName || !columnMap[columnName]) continue

        const searchValue = crit.searchValue || ""
        // 如果前端提供了清理后的值，直接使用；否则在后端清理
        const searchValueClean = crit.searchValueClean || cleanSearchValue(searchValue)
        validCriteria.push({
            columnName: columnName,
            colIndex: columnMap[columnName],
            searchValue: searchValue,  // 原始值，用于 Find 搜索
            searchValueClean: searchValueClean,  // 清理后的值，用于匹配验证
            opType: crit.op || "Contains"
        })
    }

    if (validCriteria.length === 0) {
        return { success: false, error: "条件无效", records: [] }
    }

    // 搜索逻辑 (内存遍历优化版)
    const records = []
    const MAX_RECORDS = 20 // 批量搜索时，单次查询限制更严格一些

    // 确定数据范围
    // 注意：searchMultiCriteriaInternal 接收的 headerRow 应该是准确的
    const usedRange = sheet.UsedRange; // 重新获取可能更安全，或者假定没变
    if (!usedRange) return { success: true, records: [] };

    // 我们假设 sheet 未变化，直接使用参数中的 headerRow 判断数据起始
    // 但为了安全，计算 rowCount
    const rowCount = usedRange.Rows.Count
    const startRow = usedRange.Row
    const dataStartRow = headerRow + 1
    const dataEndRow = startRow + rowCount - 1

    if (dataStartRow <= dataEndRow) {
        const firstCrit = validCriteria[0]
        const firstColIndex = firstCrit.colIndex

        // 获取第一列数据
        const firstColLetter = columnToLetter(firstColIndex)
        const rangeAddress = `${firstColLetter}${dataStartRow}:${firstColLetter}${dataEndRow}`
        let colValues = sheet.Range(rangeAddress).Value

        if (!Array.isArray(colValues)) {
            colValues = [[colValues]]
        }

        for (let i = 0; i < colValues.length; i++) {
            const rowVal = colValues[i]
            const cellVal = Array.isArray(rowVal) ? rowVal[0] : rowVal
            const currentRow = dataStartRow + i

            const cellValClean = cleanSearchValue(cellVal)
            const critValClean = firstCrit.searchValueClean

            let match = false
            if (firstCrit.opType === "Equals") {
                match = cellValClean === critValClean
            } else {
                if (critValClean === "") match = true
                else match = cellValClean.indexOf(critValClean) !== -1
            }

            if (match) {
                let matchAll = true

                if (validCriteria.length > 1) {
                    for (let j = 1; j < validCriteria.length; j++) {
                        const crit = validCriteria[j]
                        const val = sheet.Cells(currentRow, crit.colIndex).Value
                        const valClean = cleanSearchValue(val)

                        if (crit.opType === "Equals") {
                            if (valClean !== crit.searchValueClean) { matchAll = false; break }
                        } else {
                            if (crit.searchValueClean !== "" && valClean.indexOf(crit.searchValueClean) === -1) { matchAll = false; break }
                        }
                    }
                }

                if (matchAll) {
                    const rowData = {}
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
            }
        }
    }

    return {
        success: true,
        records: records,
        truncated: records.length >= MAX_RECORDS
    }
}

/**
 * 获取指定单元格的图片URL
 * @param {string} sheetName - 工作表名称
 * @param {string} cellAddress - 单个单元格地址 (如 "A1")
 * @param {Array} cells - 多个单元格地址数组 (如 ["A1", "B2", "C3"])
 * @returns {Object} 包含图片URL的对象
 */
function getImageUrlFromCell(sheetName, cellAddress, cells) {
    console.log("获取图片URL: 表=" + sheetName + ", 单元格=" + (cellAddress || JSON.stringify(cells)))

    if (!sheetName) {
        return {
            success: false,
            error: "缺少参数: sheetName",
            message: "请提供工作表名称"
        }
    }

    if (!cellAddress && (!cells || cells.length === 0)) {
        return {
            success: false,
            error: "缺少参数: cellAddress 或 cells",
            message: "请提供单元格地址或地址数组"
        }
    }

    try {
        const workbook = Application.ActiveWorkbook
        let sheet

        try {
            sheet = workbook.Sheets.Item(sheetName)
        } catch (e) {
            return {
                success: false,
                error: "未找到工作表: " + sheetName
            }
        }

        // 激活工作表
        sheet.Activate()

        const imageUrls = {}
        const cellList = cells || [cellAddress]

        for (const addr of cellList) {
            try {
                // 选择指定单元格
                const cell = sheet.Range(addr)
                cell.Select()

                // 尝试获取图片URL
                const imgUrl = Application.ActiveSheet.Shapes.GetActiveShapeImg()

                if (imgUrl) {
                    imageUrls[addr] = imgUrl
                    console.log("获取到图片: " + addr + " -> " + imgUrl.substring(0, 60) + "...")
                } else {
                    console.log("单元格 " + addr + " 没有图片或无法获取URL")
                    imageUrls[addr] = null
                }
            } catch (cellErr) {
                console.log("获取单元格 " + addr + " 图片失败: " + cellErr)
                imageUrls[addr] = null
            }
        }

        // 统计成功获取的数量
        const successCount = Object.values(imageUrls).filter(v => v !== null).length

        return {
            success: true,
            sheetName: sheetName,
            requestedCount: cellList.length,
            successCount: successCount,
            imageUrls: imageUrls
        }

    } catch (error) {
        console.error("获取图片URL失败: " + error)
        return {
            success: false,
            error: String(error),
            message: "获取图片URL时发生错误"
        }
    }
}

console.log("操作完成: " + (result.success ? "成功" : "失败"))

// 通过 console.log 输出 JSON 结果（因为 webhook 调用时 result 可能为 Undefined）
// 使用特殊标记便于后端解析
var jsonResult = JSON.stringify(result)
console.log("__RESULT_JSON_START__")
// 分块输出以避免单行过长 - 使用较小的块大小避免WPS日志截断
var chunkSize = 500
for (var i = 0; i < jsonResult.length; i += chunkSize) {
    console.log("__CHUNK_" + Math.floor(i / chunkSize) + "__:" + jsonResult.substring(i, i + chunkSize))
}
console.log("__RESULT_JSON_END__")

// 最后一行表达式作为返回值（可能不被捕获，但保留以兼容直接运行）
JSON.stringify(result)

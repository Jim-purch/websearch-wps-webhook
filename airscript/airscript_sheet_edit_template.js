/**
 * WPS智能表格 AirScript - 数据编辑模板（新增操作）
 * 
 * 适用于: WPS智能表格 (Excel-style)
 * API文档: https://airsheet.wps.cn/docs/api/excel/workbook/overview.html
 * 
 * 功能说明：
 * 1. 在指定工作表中新增单行数据
 * 2. 批量新增多行数据
 * 3. 在指定位置插入行
 * 4. 设置单元格值（支持单个或批量）
 * 
 * 使用方法：
 * 1. 将此脚本复制到WPS智能表格的"开发"功能中
 * 2. 生成脚本令牌(API Token)
 * 3. 通过HTTP POST请求调用webhook接口
 * 
 * ===== 请求示例 =====
 * 
 * 1. 在表格末尾追加单行数据:
 * POST https://www.kdocs.cn/api/v3/ide/file/:file_id/script/:script_id/sync_task
 * Header: AirScript-Token: <your_token>
 * Body: {
 *   "Context": {
 *     "argv": {
 *       "action": "appendRow",
 *       "sheetName": "Sheet1",
 *       "rowData": {
 *         "列1": "值1",
 *         "列2": "值2",
 *         "列3": "值3"
 *       }
 *     }
 *   }
 * }
 * 
 * 2. 批量追加多行数据:
 * Body: {
 *   "Context": {
 *     "argv": {
 *       "action": "appendRows",
 *       "sheetName": "Sheet1",
 *       "rows": [
 *         {"列1": "值1", "列2": "值2"},
 *         {"列1": "值3", "列2": "值4"}
 *       ]
 *     }
 *   }
 * }
 * 
 * 3. 在指定位置插入行:
 * Body: {
 *   "Context": {
 *     "argv": {
 *       "action": "insertRow",
 *       "sheetName": "Sheet1",
 *       "rowIndex": 5,
 *       "rowData": {"列1": "值1", "列2": "值2"}
 *     }
 *   }
 * }
 * 
 * 4. 直接设置单元格值:
 * Body: {
 *   "Context": {
 *     "argv": {
 *       "action": "setCellValue",
 *       "sheetName": "Sheet1",
 *       "cellAddress": "A1",
 *       "value": "新值"
 *     }
 *   }
 * }
 * 
 * 5. 批量设置区域值:
 * Body: {
 *   "Context": {
 *     "argv": {
 *       "action": "setRangeValues",
 *       "sheetName": "Sheet1",
 *       "rangeAddress": "A1:B2",
 *       "values": [["A1", "B1"], ["A2", "B2"]]
 *     }
 *   }
 * }
 */

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
 * 获取工作表的列映射 (列名 -> 列索引)
 * @param {Object} sheet - 工作表对象
 * @returns {Object} {columnMap, headerRow, startCol}
 */
function getColumnMapping(sheet) {
    try {
        const usedRange = sheet.UsedRange
        if (!usedRange) {
            return {
                success: false,
                error: "工作表为空",
                columnMap: {},
                headerRow: 1,
                startCol: 1
            }
        }

        const startRow = usedRange.Row
        const startCol = usedRange.Column
        const colCount = usedRange.Columns.Count
        const headerRow = startRow

        const columnMap = {}
        const nameCounts = {}

        // 解析表头
        for (let col = 0; col < colCount; col++) {
            const headerCell = sheet.Cells(headerRow, startCol + col)
            const headerValue = headerCell.Value
            let colName = headerValue ? String(headerValue) : columnToLetter(startCol + col)

            // 处理重复列名
            if (nameCounts[colName]) {
                nameCounts[colName]++
                colName = `${colName}-${nameCounts[colName]}`
            } else {
                nameCounts[colName] = 1
            }

            columnMap[colName] = startCol + col
        }

        return {
            success: true,
            columnMap: columnMap,
            headerRow: headerRow,
            startCol: startCol,
            colCount: colCount
        }
    } catch (error) {
        return {
            success: false,
            error: String(error),
            columnMap: {},
            headerRow: 1,
            startCol: 1
        }
    }
}

/**
 * 在表格末尾追加单行数据
 * @param {string} sheetName - 工作表名称
 * @param {Object} rowData - 行数据对象 {列名: 值}
 * @returns {Object} 操作结果
 */
function appendRow(sheetName, rowData) {
    console.log("开始追加行: 表=" + sheetName)

    // 参数验证
    if (!sheetName) {
        return {
            success: false,
            error: "缺少参数: sheetName",
            message: "请提供工作表名称"
        }
    }

    if (!rowData || typeof rowData !== 'object') {
        return {
            success: false,
            error: "缺少参数: rowData",
            message: "请提供行数据对象"
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

        // 获取列映射
        const mappingResult = getColumnMapping(sheet)
        if (!mappingResult.success) {
            return mappingResult
        }

        const columnMap = mappingResult.columnMap
        const availableColumns = Object.keys(columnMap)

        // 获取下一个空白行
        const usedRange = sheet.UsedRange
        const nextRow = usedRange.Row + usedRange.Rows.Count

        console.log("将在第 " + nextRow + " 行追加数据")

        // 遍历rowData，按列名写入数据
        let writtenCells = 0
        const invalidColumns = []

        for (const colName in rowData) {
            if (!columnMap[colName]) {
                invalidColumns.push(colName)
                continue
            }

            const colIndex = columnMap[colName]
            const value = rowData[colName]
            
            // 写入单元格
            sheet.Cells(nextRow, colIndex).Value = value
            writtenCells++
        }

        console.log("成功写入 " + writtenCells + " 个单元格")

        return {
            success: true,
            sheetName: sheetName,
            rowIndex: nextRow,
            writtenCells: writtenCells,
            invalidColumns: invalidColumns.length > 0 ? invalidColumns : undefined,
            availableColumns: availableColumns,
            message: "数据追加成功"
        }

    } catch (error) {
        console.error("追加行失败: " + error)
        return {
            success: false,
            error: String(error),
            message: "追加数据时发生错误"
        }
    }
}

/**
 * 批量追加多行数据
 * @param {string} sheetName - 工作表名称
 * @param {Array} rows - 行数据数组 [{列名: 值}, ...]
 * @returns {Object} 操作结果
 */
function appendRows(sheetName, rows) {
    console.log("开始批量追加: 表=" + sheetName + ", 行数=" + (rows ? rows.length : 0))

    // 参数验证
    if (!sheetName) {
        return {
            success: false,
            error: "缺少参数: sheetName",
            message: "请提供工作表名称"
        }
    }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return {
            success: false,
            error: "缺少参数: rows",
            message: "请提供行数据数组"
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

        // 获取列映射
        const mappingResult = getColumnMapping(sheet)
        if (!mappingResult.success) {
            return mappingResult
        }

        const columnMap = mappingResult.columnMap
        const availableColumns = Object.keys(columnMap)

        // 获取起始行
        const usedRange = sheet.UsedRange
        let startRow = usedRange.Row + usedRange.Rows.Count

        console.log("将从第 " + startRow + " 行开始批量追加")

        const results = []
        let totalWrittenCells = 0

        // 遍历每一行数据
        for (let i = 0; i < rows.length; i++) {
            const rowData = rows[i]
            const currentRow = startRow + i
            let writtenCells = 0
            const invalidColumns = []

            // 遍历该行的列数据
            for (const colName in rowData) {
                if (!columnMap[colName]) {
                    invalidColumns.push(colName)
                    continue
                }

                const colIndex = columnMap[colName]
                const value = rowData[colName]
                
                // 写入单元格
                sheet.Cells(currentRow, colIndex).Value = value
                writtenCells++
                totalWrittenCells++
            }

            results.push({
                rowIndex: currentRow,
                writtenCells: writtenCells,
                invalidColumns: invalidColumns.length > 0 ? invalidColumns : undefined
            })

            // 每10行输出一次进度
            if ((i + 1) % 10 === 0) {
                console.log("已处理 " + (i + 1) + "/" + rows.length + " 行")
            }
        }

        console.log("批量追加完成，共写入 " + totalWrittenCells + " 个单元格")

        return {
            success: true,
            sheetName: sheetName,
            totalRows: rows.length,
            totalWrittenCells: totalWrittenCells,
            startRow: startRow,
            endRow: startRow + rows.length - 1,
            results: results,
            availableColumns: availableColumns,
            message: "批量追加成功"
        }

    } catch (error) {
        console.error("批量追加失败: " + error)
        return {
            success: false,
            error: String(error),
            message: "批量追加数据时发生错误"
        }
    }
}

/**
 * 在指定位置插入行并填充数据
 * @param {string} sheetName - 工作表名称
 * @param {number} rowIndex - 插入位置的行号（在此行之前插入）
 * @param {Object} rowData - 行数据对象 {列名: 值}
 * @returns {Object} 操作结果
 */
function insertRow(sheetName, rowIndex, rowData) {
    console.log("开始插入行: 表=" + sheetName + ", 行号=" + rowIndex)

    // 参数验证
    if (!sheetName) {
        return {
            success: false,
            error: "缺少参数: sheetName",
            message: "请提供工作表名称"
        }
    }

    if (!rowIndex || rowIndex < 1) {
        return {
            success: false,
            error: "无效参数: rowIndex",
            message: "行号必须大于等于1"
        }
    }

    if (!rowData || typeof rowData !== 'object') {
        return {
            success: false,
            error: "缺少参数: rowData",
            message: "请提供行数据对象"
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

        // 获取列映射
        const mappingResult = getColumnMapping(sheet)
        if (!mappingResult.success) {
            return mappingResult
        }

        const columnMap = mappingResult.columnMap
        const availableColumns = Object.keys(columnMap)

        // 在指定位置插入一行
        const targetRange = sheet.Rows(rowIndex)
        targetRange.Insert()

        console.log("已在第 " + rowIndex + " 行前插入新行，原数据下移")

        // 写入数据到新插入的行
        let writtenCells = 0
        const invalidColumns = []

        for (const colName in rowData) {
            if (!columnMap[colName]) {
                invalidColumns.push(colName)
                continue
            }

            const colIndex = columnMap[colName]
            const value = rowData[colName]
            
            // 写入单元格
            sheet.Cells(rowIndex, colIndex).Value = value
            writtenCells++
        }

        console.log("成功写入 " + writtenCells + " 个单元格")

        return {
            success: true,
            sheetName: sheetName,
            rowIndex: rowIndex,
            writtenCells: writtenCells,
            invalidColumns: invalidColumns.length > 0 ? invalidColumns : undefined,
            availableColumns: availableColumns,
            message: "行插入成功"
        }

    } catch (error) {
        console.error("插入行失败: " + error)
        return {
            success: false,
            error: String(error),
            message: "插入行时发生错误"
        }
    }
}

/**
 * 设置单个单元格的值
 * @param {string} sheetName - 工作表名称
 * @param {string} cellAddress - 单元格地址（如 "A1"）
 * @param {any} value - 要设置的值
 * @returns {Object} 操作结果
 */
function setCellValue(sheetName, cellAddress, value) {
    console.log("设置单元格值: 表=" + sheetName + ", 单元格=" + cellAddress)

    // 参数验证
    if (!sheetName) {
        return {
            success: false,
            error: "缺少参数: sheetName",
            message: "请提供工作表名称"
        }
    }

    if (!cellAddress) {
        return {
            success: false,
            error: "缺少参数: cellAddress",
            message: "请提供单元格地址"
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

        // 设置单元格值
        const cell = sheet.Range(cellAddress)
        cell.Value = value

        console.log("单元格 " + cellAddress + " 已更新")

        return {
            success: true,
            sheetName: sheetName,
            cellAddress: cellAddress,
            value: value,
            message: "单元格更新成功"
        }

    } catch (error) {
        console.error("设置单元格值失败: " + error)
        return {
            success: false,
            error: String(error),
            message: "设置单元格值时发生错误"
        }
    }
}

/**
 * 批量设置区域的值
 * @param {string} sheetName - 工作表名称
 * @param {string} rangeAddress - 区域地址（如 "A1:B2"）
 * @param {Array|any} values - 要设置的值（二维数组或单个值）
 * @returns {Object} 操作结果
 */
function setRangeValues(sheetName, rangeAddress, values) {
    console.log("设置区域值: 表=" + sheetName + ", 区域=" + rangeAddress)

    // 参数验证
    if (!sheetName) {
        return {
            success: false,
            error: "缺少参数: sheetName",
            message: "请提供工作表名称"
        }
    }

    if (!rangeAddress) {
        return {
            success: false,
            error: "缺少参数: rangeAddress",
            message: "请提供区域地址"
        }
    }

    if (values === undefined || values === null) {
        return {
            success: false,
            error: "缺少参数: values",
            message: "请提供要设置的值"
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

        // 设置区域值
        const range = sheet.Range(rangeAddress)
        range.Value = values

        console.log("区域 " + rangeAddress + " 已更新")

        let cellCount = 0
        if (Array.isArray(values)) {
            // 二维数组
            cellCount = values.reduce((sum, row) => sum + (Array.isArray(row) ? row.length : 1), 0)
        } else {
            // 单个值
            cellCount = range.Count
        }

        return {
            success: true,
            sheetName: sheetName,
            rangeAddress: rangeAddress,
            cellCount: cellCount,
            message: "区域更新成功"
        }

    } catch (error) {
        console.error("设置区域值失败: " + error)
        return {
            success: false,
            error: String(error),
            message: "设置区域值时发生错误"
        }
    }
}

/**
 * 根据列名设置指定行的数据
 * @param {string} sheetName - 工作表名称
 * @param {number} rowIndex - 行号
 * @param {Object} rowData - 行数据对象 {列名: 值}
 * @returns {Object} 操作结果
 */
function updateRow(sheetName, rowIndex, rowData) {
    console.log("更新行数据: 表=" + sheetName + ", 行号=" + rowIndex)

    // 参数验证
    if (!sheetName) {
        return {
            success: false,
            error: "缺少参数: sheetName",
            message: "请提供工作表名称"
        }
    }

    if (!rowIndex || rowIndex < 1) {
        return {
            success: false,
            error: "无效参数: rowIndex",
            message: "行号必须大于等于1"
        }
    }

    if (!rowData || typeof rowData !== 'object') {
        return {
            success: false,
            error: "缺少参数: rowData",
            message: "请提供行数据对象"
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

        // 获取列映射
        const mappingResult = getColumnMapping(sheet)
        if (!mappingResult.success) {
            return mappingResult
        }

        const columnMap = mappingResult.columnMap
        const availableColumns = Object.keys(columnMap)

        // 更新指定行的数据
        let writtenCells = 0
        const invalidColumns = []

        for (const colName in rowData) {
            if (!columnMap[colName]) {
                invalidColumns.push(colName)
                continue
            }

            const colIndex = columnMap[colName]
            const value = rowData[colName]
            
            // 写入单元格
            sheet.Cells(rowIndex, colIndex).Value = value
            writtenCells++
        }

        console.log("成功更新 " + writtenCells + " 个单元格")

        return {
            success: true,
            sheetName: sheetName,
            rowIndex: rowIndex,
            writtenCells: writtenCells,
            invalidColumns: invalidColumns.length > 0 ? invalidColumns : undefined,
            availableColumns: availableColumns,
            message: "行更新成功"
        }

    } catch (error) {
        console.error("更新行失败: " + error)
        return {
            success: false,
            error: String(error),
            message: "更新行时发生错误"
        }
    }
}

// ========== 主执行逻辑 ==========
console.log("=== AirScript 智能表格数据编辑API ===")

// 获取传入的参数
var argv = Context.argv || {}
var action = argv.action || ""

console.log("执行操作: " + action)
console.log("参数: " + JSON.stringify(argv))

var result

if (action === "appendRow") {
    // 追加单行数据
    result = appendRow(argv.sheetName, argv.rowData)
} else if (action === "appendRows") {
    // 批量追加多行数据
    result = appendRows(argv.sheetName, argv.rows)
} else if (action === "insertRow") {
    // 在指定位置插入行
    result = insertRow(argv.sheetName, argv.rowIndex, argv.rowData)
} else if (action === "setCellValue") {
    // 设置单个单元格值
    result = setCellValue(argv.sheetName, argv.cellAddress, argv.value)
} else if (action === "setRangeValues") {
    // 批量设置区域值
    result = setRangeValues(argv.sheetName, argv.rangeAddress, argv.values)
} else if (action === "updateRow") {
    // 更新指定行的数据
    result = updateRow(argv.sheetName, argv.rowIndex, argv.rowData)
} else {
    result = {
        success: false,
        error: "未知操作: " + action,
        message: "支持的操作: appendRow, appendRows, insertRow, setCellValue, setRangeValues, updateRow"
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

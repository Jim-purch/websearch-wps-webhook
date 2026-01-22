/**
 * WPS多维表格 AirScript - 通用数据查询模板
 * 
 * 适用于: WPS多维表格 (Database-style)
 * 
 * 通过webhook调用此脚本，可以：
 * 1. 获取文档中全部数据表的名称和列名称
 * 2. 通过指定列名称和值进行搜索，返回对应行的JSON数据
 * 3. 获取指定表的详细信息和示例数据
 * 
 * 使用方法：
 * 1. 将此脚本复制到WPS多维表格的"开发"功能中
 * 2. 生成脚本令牌(API Token)
 * 3. 通过HTTP POST请求调用webhook接口
 * 
 * ===== 请求示例 =====
 * 
 * 获取全部表信息:
 * POST https://www.kdocs.cn/api/v3/ide/file/:file_id/script/:script_id/sync_task
 * Header: AirScript-Token: <your_token>
 * Body: {"Context":{"argv":{"action":"getAll"}}}
 * 
 * 按列搜索:
 * Body: {"Context":{"argv":{
 *   "action":"search",
 *   "sheetName":"表名",
 *   "columnName":"列名",
 *   "searchValue":"搜索值",
 *   "op":"Contains"
 * }}}
 * 
 * 获取表详情:
 * Body: {"Context":{"argv":{"action":"details","sheetName":"表名","sampleSize":5}}}
 */

/**
 * 获取全部数据表信息
 * @returns {Object} 包含所有表名和列信息的对象
 */
function getAllTablesInfo() {
    console.log("开始获取全部数据表信息...")

    try {
        // 获取所有表信息
        const sheets = Application.Sheet.GetSheets()

        if (!sheets || sheets.length === 0) {
            return {
                success: true,
                tables: [],
                message: "当前文档没有数据表"
            }
        }

        console.log("找到 " + sheets.length + " 个数据表")

        const tables = []

        for (const sheet of sheets) {
            console.log("处理数据表: " + sheet.name + " (ID: " + sheet.id + ")")

            // 获取表的字段描述信息
            const columns = []

            try {
                const fieldDescriptors = Application.Sheets(sheet.name).FieldDescriptors
                const fieldCount = fieldDescriptors.Count

                for (let i = 1; i <= fieldCount; i++) {
                    const field = fieldDescriptors.Item(i)
                    columns.push({
                        name: field.Name,
                        type: field.Type,
                        id: "@" + field.Name
                    })
                }
            } catch (fieldError) {
                console.log("获取表 " + sheet.name + " 的字段信息失败: " + fieldError)
            }

            tables.push({
                name: sheet.name,
                id: sheet.id,
                columns: columns
            })
        }

        console.log("数据表信息获取完成")

        return {
            success: true,
            tables: tables
        }

    } catch (error) {
        console.error("获取数据表信息失败: " + error)
        return {
            success: false,
            error: String(error),
            message: "获取数据表信息时发生错误"
        }
    }
}

/**
 * 按列搜索记录
 * @param {string} sheetName - 数据表名称
 * @param {string} columnName - 列名称
 * @param {string} searchValue - 搜索值
 * @param {string} op - 筛选操作符
 * @returns {Object} 包含匹配记录的对象
 * 
 * 支持的操作符:
 * - Equals: 等于
 * - NotEqu: 不等于
 * - Contains: 包含
 * - NotContains: 不包含
 * - BeginWith: 开头是
 * - EndWith: 结尾是
 * - Empty: 为空
 * - NotEmpty: 不为空
 * - Greater: 大于
 * - GreaterEqu: 大于等于
 * - Less: 小于
 * - LessEqu: 小于等于
 */
function searchByColumn(sheetName, columnName, searchValue, op) {
    console.log("开始搜索: 表=" + sheetName + ", 列=" + columnName + ", 值=" + searchValue + ", 操作=" + op)

    // 参数验证
    if (!sheetName) {
        return {
            success: false,
            error: "缺少参数: sheetName",
            message: "请提供数据表名称"
        }
    }

    if (!columnName) {
        return {
            success: false,
            error: "缺少参数: columnName",
            message: "请提供列名称"
        }
    }

    // 默认操作符
    const opType = op || "Contains"

    // 验证操作符
    const validOps = ["Equals", "NotEqu", "Greater", "GreaterEqu", "Less", "LessEqu",
        "BeginWith", "EndWith", "Contains", "NotContains", "Intersected",
        "Empty", "NotEmpty"]
    if (!validOps.includes(opType)) {
        return {
            success: false,
            error: "无效的操作符: " + opType,
            message: "有效的操作符: " + validOps.join(", ")
        }
    }

    try {
        // 获取所有表信息以验证表名
        const sheets = Application.Sheet.GetSheets()

        // 调试：打印正在查找的表名
        console.log("正在查找表名: [" + sheetName + "], 长度: " + sheetName.length)

        // 调试：遍历所有表检查匹配
        let foundSheet = null
        for (const sheet of sheets) {
            const isMatch = sheet.name === sheetName
            if (isMatch) {
                console.log("找到匹配: 表名=[" + sheet.name + "], ID=" + sheet.id)
                foundSheet = sheet
                break
            }
        }

        const targetSheet = foundSheet

        if (!targetSheet) {
            console.log("未找到匹配的表，可用表列表:")
            for (const s of sheets) {
                console.log("  - [" + s.name + "] ID=" + s.id)
            }
            return {
                success: false,
                error: "未找到数据表: " + sheetName,
                message: "请检查数据表名称是否正确",
                availableSheets: sheets.map(s => s.name)
            }
        }

        const sheetId = targetSheet.id
        console.log("使用表: [" + targetSheet.name + "], SheetId=" + sheetId)

        // 验证列名是否存在
        try {
            const fieldDescriptors = Application.Sheets(sheetName).FieldDescriptors
            const fieldCount = fieldDescriptors.Count
            const availableColumns = []
            let columnExists = false

            for (let i = 1; i <= fieldCount; i++) {
                const field = fieldDescriptors.Item(i)
                availableColumns.push(field.Name)
                if (field.Name === columnName) {
                    columnExists = true
                }
            }

            if (!columnExists) {
                return {
                    success: false,
                    error: "未找到列: " + columnName,
                    message: "请检查列名称是否正确",
                    sheetName: sheetName,
                    availableColumns: availableColumns
                }
            }
        } catch (fieldError) {
            console.log("验证列名时出错: " + fieldError + ", 将继续尝试搜索")
        }

        // 构建筛选条件
        const filter = {
            "mode": "AND",
            "criteria": []
        }

        // Empty 和 NotEmpty 不需要 values
        if (opType === "Empty" || opType === "NotEmpty") {
            filter.criteria.push({
                "field": columnName,
                "op": opType
            })
        } else {
            if (!searchValue && searchValue !== 0) {
                return {
                    success: false,
                    error: "缺少参数: searchValue",
                    message: "请提供搜索值 (除 Empty/NotEmpty 操作外)"
                }
            }
            filter.criteria.push({
                "field": columnName,
                "op": opType,
                "values": [String(searchValue)]
            })
        }

        console.log("筛选条件: " + JSON.stringify(filter))

        // 分页查询匹配记录，限制最大返回100条以避免超时
        var MAX_RECORDS = 100
        let allRecords = []
        let offset = null
        let pageCount = 0
        let truncated = false
        let originalTotalCount = 0

        try {
            do {
                pageCount++
                console.log("正在查询第 " + pageCount + " 页... SheetId=" + sheetId)

                const pageResult = Application.Record.GetRecords({
                    SheetId: sheetId,
                    Offset: offset,
                    Filter: filter
                })

                if (!pageResult || !pageResult.records) {
                    console.log("查询返回空结果")
                    break
                }

                allRecords = allRecords.concat(pageResult.records)
                offset = pageResult.offset

                console.log("第 " + pageCount + " 页获取到 " + pageResult.records.length + " 条记录，累计 " + allRecords.length + " 条")

                // 检查是否已达到最大限制
                if (allRecords.length >= MAX_RECORDS) {
                    // 如果还有更多数据，标记为已截断
                    if (offset) {
                        truncated = true
                        originalTotalCount = allRecords.length  // 至少有这么多
                        console.log("已达到最大记录限制 " + MAX_RECORDS + " 条，停止查询")
                    }
                    break
                }

            } while (offset)
        } catch (queryError) {
            console.error("分页查询失败: " + queryError)
            return {
                success: false,
                error: "查询失败: " + String(queryError),
                message: "在表 " + sheetName + " 上执行筛选查询时出错",
                sheetName: sheetName,
                sheetId: sheetId,
                filter: filter
            }
        }

        // 如果超过限制，截断结果
        let finalRecords = allRecords
        if (allRecords.length > MAX_RECORDS) {
            truncated = true
            originalTotalCount = allRecords.length
            finalRecords = allRecords.slice(0, MAX_RECORDS)
            console.log("结果已从 " + allRecords.length + " 条截断为 " + MAX_RECORDS + " 条")
        }

        console.log("搜索完成，共找到 " + allRecords.length + " 条匹配记录" + (truncated ? "(已截断)" : ""))

        return {
            success: true,
            sheetName: sheetName,
            columnName: columnName,
            searchValue: searchValue,
            op: opType,
            totalCount: finalRecords.length,
            originalTotalCount: truncated ? (originalTotalCount + "+") : finalRecords.length,
            truncated: truncated,
            maxRecords: MAX_RECORDS,
            records: JSON.parse(JSON.stringify(finalRecords))
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
 * 获取指定数据表的详细信息
 * @param {string} sheetName - 数据表名称
 * @param {number} sampleSize - 示例数据行数（默认5）
 * @returns {Object} 表详情
 */
function getTableDetails(sheetName, sampleSize) {
    console.log("获取数据表详情: " + sheetName)

    if (!sheetName) {
        return {
            success: false,
            error: "缺少参数: sheetName",
            message: "请提供数据表名称"
        }
    }

    try {
        const sheets = Application.Sheet.GetSheets()
        const targetSheet = sheets.find(sheet => sheet.name === sheetName)

        if (!targetSheet) {
            return {
                success: false,
                error: "未找到数据表: " + sheetName,
                availableSheets: sheets.map(s => s.name)
            }
        }

        // 获取列信息
        const columns = []
        const fieldDescriptors = Application.Sheets(sheetName).FieldDescriptors
        const fieldCount = fieldDescriptors.Count

        for (let i = 1; i <= fieldCount; i++) {
            const field = fieldDescriptors.Item(i)
            columns.push({
                name: field.Name,
                type: field.Type,
                id: "@" + field.Name
            })
        }

        // 获取示例数据
        const limit = Math.min(Math.max(1, sampleSize || 5), 20)
        console.log("请求示例数据, limit=" + limit + ", sheetId=" + targetSheet.id)

        const sampleRecords = Application.Record.GetRecords({
            SheetId: targetSheet.id,
            MaxRecords: limit
        })

        console.log("获取到 " + sampleRecords.records.length + " 条示例记录")

        return {
            success: true,
            table: {
                name: sheetName,
                id: targetSheet.id,
                columnCount: columns.length,
                columns: columns
            },
            sampleData: {
                count: sampleRecords.records.length,
                records: JSON.parse(JSON.stringify(sampleRecords.records))
            }
        }

    } catch (error) {
        console.error("获取表详情失败: " + error)
        return {
            success: false,
            error: String(error)
        }
    }
}

/**
 * 多条件 AND 搜索记录
 * @param {string} sheetName - 数据表名称
 * @param {Array} criteria - 条件数组，每个条件为 {columnName, searchValue, op}
 * @returns {Object} 包含匹配记录的对象
 * 
 * 示例:
 * criteria = [
 *   {columnName: "零件号", searchValue: "123", op: "Contains"},
 *   {columnName: "配件级别", searchValue: "F", op: "Equals"}
 * ]
 */
function searchMultiCriteria(sheetName, criteria) {
    console.log("开始多条件搜索: 表=" + sheetName + ", 条件数=" + (criteria ? criteria.length : 0))

    // 参数验证
    if (!sheetName) {
        return {
            success: false,
            error: "缺少参数: sheetName",
            message: "请提供数据表名称"
        }
    }

    if (!criteria || !Array.isArray(criteria) || criteria.length === 0) {
        return {
            success: false,
            error: "缺少参数: criteria",
            message: "请提供至少一个搜索条件"
        }
    }

    const validOps = ["Equals", "NotEqu", "Greater", "GreaterEqu", "Less", "LessEqu",
        "BeginWith", "EndWith", "Contains", "NotContains", "Intersected",
        "Empty", "NotEmpty"]

    try {
        // 获取所有表信息以验证表名
        const sheets = Application.Sheet.GetSheets()

        let foundSheet = null
        for (const sheet of sheets) {
            if (sheet.name === sheetName) {
                foundSheet = sheet
                break
            }
        }

        if (!foundSheet) {
            return {
                success: false,
                error: "未找到数据表: " + sheetName,
                message: "请检查数据表名称是否正确",
                availableSheets: sheets.map(s => s.name)
            }
        }

        const sheetId = foundSheet.id
        console.log("使用表: [" + foundSheet.name + "], SheetId=" + sheetId)

        // 获取表的列信息用于验证
        const availableColumns = []
        try {
            const fieldDescriptors = Application.Sheets(sheetName).FieldDescriptors
            const fieldCount = fieldDescriptors.Count
            for (let i = 1; i <= fieldCount; i++) {
                availableColumns.push(fieldDescriptors.Item(i).Name)
            }
        } catch (fieldError) {
            console.log("获取列信息时出错: " + fieldError)
        }

        // 构建筛选条件 - 使用 AND 模式组合所有条件
        const filter = {
            "mode": "AND",
            "criteria": []
        }

        // 记录使用的条件描述
        const criteriaDescriptions = []

        for (const crit of criteria) {
            const columnName = crit.columnName
            const searchValue = crit.searchValue
            const opType = crit.op || "Contains"

            if (!columnName) {
                continue  // 跳过无效条件
            }

            // 验证操作符
            if (!validOps.includes(opType)) {
                return {
                    success: false,
                    error: "无效的操作符: " + opType,
                    message: "有效的操作符: " + validOps.join(", ")
                }
            }

            // 验证列名是否存在
            if (availableColumns.length > 0 && !availableColumns.includes(columnName)) {
                return {
                    success: false,
                    error: "未找到列: " + columnName,
                    message: "请检查列名称是否正确",
                    sheetName: sheetName,
                    availableColumns: availableColumns
                }
            }

            // 构建条件
            if (opType === "Empty" || opType === "NotEmpty") {
                filter.criteria.push({
                    "field": columnName,
                    "op": opType
                })
                criteriaDescriptions.push(columnName + " " + opType)
            } else {
                if (!searchValue && searchValue !== 0) {
                    continue  // 跳过空值条件（除非是 Empty/NotEmpty）
                }
                filter.criteria.push({
                    "field": columnName,
                    "op": opType,
                    "values": [String(searchValue)]
                })
                criteriaDescriptions.push(columnName + " " + opType + " '" + searchValue + "'")
            }
        }

        if (filter.criteria.length === 0) {
            return {
                success: false,
                error: "没有有效的搜索条件",
                message: "请至少提供一个有效的搜索条件"
            }
        }

        console.log("筛选条件 (" + filter.criteria.length + " 个): " + criteriaDescriptions.join(" AND "))

        // 分页查询匹配记录，限制最大返回100条以避免超时
        var MAX_RECORDS = 100
        let allRecords = []
        let offset = null
        let pageCount = 0
        let truncated = false
        let originalTotalCount = 0

        try {
            do {
                pageCount++
                console.log("正在查询第 " + pageCount + " 页... SheetId=" + sheetId)

                const pageResult = Application.Record.GetRecords({
                    SheetId: sheetId,
                    Offset: offset,
                    Filter: filter
                })

                if (!pageResult || !pageResult.records) {
                    console.log("查询返回空结果")
                    break
                }

                allRecords = allRecords.concat(pageResult.records)
                offset = pageResult.offset

                console.log("第 " + pageCount + " 页获取到 " + pageResult.records.length + " 条记录，累计 " + allRecords.length + " 条")

                // 检查是否已达到最大限制
                if (allRecords.length >= MAX_RECORDS) {
                    if (offset) {
                        truncated = true
                        originalTotalCount = allRecords.length
                        console.log("已达到最大记录限制 " + MAX_RECORDS + " 条，停止查询")
                    }
                    break
                }

            } while (offset)
        } catch (queryError) {
            console.error("分页查询失败: " + queryError)
            return {
                success: false,
                error: "查询失败: " + String(queryError),
                message: "在表 " + sheetName + " 上执行筛选查询时出错",
                sheetName: sheetName,
                sheetId: sheetId,
                filter: filter
            }
        }

        // 如果超过限制，截断结果
        let finalRecords = allRecords
        if (allRecords.length > MAX_RECORDS) {
            truncated = true
            originalTotalCount = allRecords.length
            finalRecords = allRecords.slice(0, MAX_RECORDS)
            console.log("结果已从 " + allRecords.length + " 条截断为 " + MAX_RECORDS + " 条")
        }

        console.log("多条件搜索完成，共找到 " + allRecords.length + " 条匹配记录" + (truncated ? "(已截断)" : ""))

        return {
            success: true,
            sheetName: sheetName,
            criteriaCount: filter.criteria.length,
            criteriaDescription: criteriaDescriptions.join(" AND "),
            totalCount: finalRecords.length,
            originalTotalCount: truncated ? (originalTotalCount + "+") : finalRecords.length,
            truncated: truncated,
            maxRecords: MAX_RECORDS,
            records: JSON.parse(JSON.stringify(finalRecords))
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
console.log("=== AirScript 多维表格数据API ===")

// 获取传入的参数
var argv = Context.argv || {}
var action = argv.action || "getAll"

console.log("执行操作: " + action)
console.log("参数: " + JSON.stringify(argv))

var result

if (action === "getAll") {
    result = getAllTablesInfo()
} else if (action === "search") {
    result = searchByColumn(argv.sheetName, argv.columnName, argv.searchValue, argv.op)
} else if (action === "searchMulti") {
    // 多条件 AND 搜索
    result = searchMultiCriteria(argv.sheetName, argv.criteria)
} else if (action === "details") {
    result = getTableDetails(argv.sheetName, argv.sampleSize)
} else {
    result = {
        success: false,
        error: "未知操作: " + action,
        message: "支持的操作: getAll, search, searchMulti, details"
    }
}

console.log("操作完成: " + (result.success ? "成功" : "失败"))

// 输出结果到日志，分块避免WPS日志截断（每块500字符）
var jsonOutput = JSON.stringify(result)
var chunkSize = 500
var totalChunks = Math.ceil(jsonOutput.length / chunkSize)

console.log("__RESULT_JSON_START__")
console.log("__CHUNKS__:" + totalChunks)
for (var i = 0; i < totalChunks; i++) {
    var chunk = jsonOutput.substring(i * chunkSize, (i + 1) * chunkSize)
    console.log("__CHUNK_" + i + "__:" + chunk)
}
console.log("__RESULT_JSON_END__")

// 最后一行表达式作为返回值
JSON.stringify(result)


<?php
$message = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = $_POST['username'] ?? '';
    $email = $_POST['email'] ?? '';
    $category = $_POST['category'] ?? '';
    $message = "收到提交：用户名={$username}, 邮箱={$email}, 分类={$category}";
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CogitoAgent 测试页面</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            background: #f5f5f5;
        }
        h1 {
            color: #333;
            margin-bottom: 30px;
            text-align: center;
        }
        .section {
            background: white;
            padding: 25px;
            margin-bottom: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h2 {
            color: #555;
            margin-bottom: 15px;
            font-size: 18px;
        }
        .image-container {
            text-align: center;
        }
        .image-container img {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            color: #666;
            font-size: 14px;
        }
        input[type="text"],
        input[type="email"],
        input[type="password"],
        textarea,
        select {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
        }
        textarea {
            min-height: 100px;
            resize: vertical;
        }
        .checkbox-group,
        .radio-group {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
        }
        .checkbox-group label,
        .radio-group label {
            display: flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
        }
        .button-group {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        button {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: opacity 0.2s;
        }
        button:hover {
            opacity: 0.9;
        }
        .btn-primary {
            background: #007bff;
            color: white;
        }
        .btn-success {
            background: #28a745;
            color: white;
        }
        .btn-danger {
            background: #dc3545;
            color: white;
        }
        .btn-warning {
            background: #ffc107;
            color: #333;
        }
        .link-group {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
        }
        a {
            color: #007bff;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .list-group {
            list-style: none;
        }
        .list-group li {
            padding: 10px;
            border-bottom: 1px solid #eee;
        }
        .list-group li:last-child {
            border-bottom: none;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
        }
        .alert {
            padding: 12px 15px;
            border-radius: 4px;
            margin-bottom: 10px;
        }
        .alert-info {
            background: #d1ecf1;
            color: #0c5460;
        }
        .alert-success {
            background: #d4edda;
            color: #155724;
        }
        .alert-warning {
            background: #fff3cd;
            color: #856404;
        }
        .result-box {
            background: #e8f5e9;
            padding: 15px;
            border-radius: 4px;
            margin-top: 15px;
            display: none;
        }
        .result-box.show {
            display: block;
        }
        #click-counter {
            font-size: 24px;
            color: #007bff;
            font-weight: bold;
        }
        .dynamic-content {
            min-height: 50px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 4px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <h1>CogitoAgent 网页测试</h1>

    <?php if ($message): ?>
    <div class="section">
        <div class="alert alert-success"><?php echo htmlspecialchars($message); ?></div>
    </div>
    <?php endif; ?>

    <div class="section">
        <h2>图片展示</h2>
        <div class="image-container">
            <img src="test.png" alt="测试图片" id="test-image">
        </div>
    </div>

    <div class="section">
        <h2>PHP 表单提交</h2>
        <form method="POST" action="">
            <div class="form-group">
                <label for="username">用户名</label>
                <input type="text" id="username" name="username" placeholder="请输入用户名">
            </div>
            <div class="form-group">
                <label for="email">邮箱</label>
                <input type="email" id="email" name="email" placeholder="example@email.com">
            </div>
            <div class="form-group">
                <label for="category">分类</label>
                <select id="category" name="category">
                    <option value="">请选择</option>
                    <option value="tech">技术</option>
                    <option value="life">生活</option>
                    <option value="work">工作</option>
                    <option value="other">其他</option>
                </select>
            </div>
            <button type="submit" class="btn-primary">提交到 PHP</button>
        </form>
    </div>

    <div class="section">
        <h2>文本输入</h2>
        <div class="form-group">
            <label for="password">密码</label>
            <input type="password" id="password" placeholder="请输入密码">
        </div>
        <div class="form-group">
            <label for="message">留言</label>
            <textarea id="message" placeholder="请输入留言内容..."></textarea>
        </div>
    </div>

    <div class="section">
        <h2>复选框</h2>
        <div class="form-group">
            <label>兴趣爱好</label>
            <div class="checkbox-group">
                <label><input type="checkbox" value="coding" class="hobby-checkbox"> 编程</label>
                <label><input type="checkbox" value="reading" class="hobby-checkbox"> 阅读</label>
                <label><input type="checkbox" value="music" class="hobby-checkbox"> 音乐</label>
                <label><input type="checkbox" value="sports" class="hobby-checkbox"> 运动</label>
            </div>
        </div>
        <div id="hobby-result" class="dynamic-content">请选择兴趣爱好...</div>
    </div>

    <div class="section">
        <h2>单选框</h2>
        <div class="form-group">
            <label>性别</label>
            <div class="radio-group">
                <label><input type="radio" name="gender" value="male" class="gender-radio"> 男</label>
                <label><input type="radio" name="gender" value="female" class="gender-radio"> 女</label>
                <label><input type="radio" name="gender" value="other" class="gender-radio"> 其他</label>
            </div>
        </div>
        <div id="gender-result" class="dynamic-content">请选择性别...</div>
    </div>

    <div class="section">
        <h2>按钮 & JS 交互</h2>
        <div class="button-group">
            <button class="btn-primary" onclick="handleClick('primary')">主要按钮</button>
            <button class="btn-success" onclick="handleClick('success')">成功按钮</button>
            <button class="btn-warning" onclick="handleClick('warning')">警告按钮</button>
            <button class="btn-danger" onclick="handleClick('danger')">危险按钮</button>
        </div>
        <div class="result-box" id="button-result"></div>
        <p style="margin-top: 15px;">点击次数: <span id="click-counter">0</span></p>
    </div>

    <div class="section">
        <h2>AJAX 动态加载</h2>
        <button class="btn-primary" onclick="loadData()">加载数据</button>
        <div id="ajax-content" class="dynamic-content">点击按钮加载数据...</div>
    </div>

    <div class="section">
        <h2>链接</h2>
        <div class="link-group">
            <a href="#" onclick="alert('点击了首页'); return false;">首页</a>
            <a href="#" onclick="alert('点击了关于我们'); return false;">关于我们</a>
            <a href="#" onclick="alert('点击了联系方式'); return false;">联系方式</a>
            <a href="https://github.com" target="_blank">GitHub</a>
        </div>
    </div>

    <div class="section">
        <h2>列表</h2>
        <ul class="list-group" id="dynamic-list">
            <li>列表项 1 - 普通文本</li>
            <li>列表项 2 - 带 <a href="#">链接</a></li>
            <li>列表项 3 - 带 <strong>加粗</strong> 和 <em>斜体</em></li>
        </ul>
        <button class="btn-success" onclick="addListItem()" style="margin-top: 10px;">添加列表项</button>
    </div>

    <div class="section">
        <h2>表格</h2>
        <table id="data-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>名称</th>
                    <th>状态</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>001</td>
                    <td>项目 A</td>
                    <td>进行中</td>
                    <td><a href="#" onclick="deleteRow(this); return false;">删除</a></td>
                </tr>
                <tr>
                    <td>002</td>
                    <td>项目 B</td>
                    <td>已完成</td>
                    <td><a href="#" onclick="deleteRow(this); return false;">删除</a></td>
                </tr>
                <tr>
                    <td>003</td>
                    <td>项目 C</td>
                    <td>待开始</td>
                    <td><a href="#" onclick="deleteRow(this); return false;">删除</a></td>
                </tr>
            </tbody>
        </table>
        <button class="btn-primary" onclick="addTableRow()" style="margin-top: 10px;">添加行</button>
    </div>

    <div class="section">
        <h2>提示信息</h2>
        <div class="alert alert-info" onclick="toggleAlert(this)">这是信息提示框（点击切换）</div>
        <div class="alert alert-success" onclick="toggleAlert(this)">这是成功提示框（点击切换）</div>
        <div class="alert alert-warning" onclick="toggleAlert(this)">这是警告提示框（点击切换）</div>
    </div>

    <script>
        let clickCount = 0;

        function handleClick(type) {
            clickCount++;
            document.getElementById('click-counter').textContent = clickCount;
            
            const resultBox = document.getElementById('button-result');
            const messages = {
                'primary': '你点击了主要按钮！',
                'success': '你点击了成功按钮！',
                'warning': '你点击了警告按钮！',
                'danger': '你点击了危险按钮！'
            };
            
            resultBox.textContent = messages[type] + ' (总点击: ' + clickCount + ')';
            resultBox.classList.add('show');
            
            setTimeout(() => {
                resultBox.classList.remove('show');
            }, 3000);
        }

        document.querySelectorAll('.hobby-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const checked = document.querySelectorAll('.hobby-checkbox:checked');
                const values = Array.from(checked).map(cb => cb.value);
                document.getElementById('hobby-result').textContent = 
                    values.length > 0 ? '已选择: ' + values.join(', ') : '请选择兴趣爱好...';
            });
        });

        document.querySelectorAll('.gender-radio').forEach(radio => {
            radio.addEventListener('change', function() {
                const genderMap = {
                    'male': '男',
                    'female': '女',
                    'other': '其他'
                };
                document.getElementById('gender-result').textContent = 
                    '已选择: ' + genderMap[this.value];
            });
        });

        function loadData() {
            const content = document.getElementById('ajax-content');
            content.textContent = '加载中...';
            
            setTimeout(() => {
                const data = [
                    { name: '项目 A', status: '进行中', time: '2024-01-15' },
                    { name: '项目 B', status: '已完成', time: '2024-01-10' },
                    { name: '项目 C', status: '待开始', time: '2024-01-20' }
                ];
                
                let html = '<ul>';
                data.forEach(item => {
                    html += `<li>${item.name} - ${item.status} (${item.time})</li>`;
                });
                html += '</ul>';
                
                content.innerHTML = html;
            }, 1000);
        }

        let listCounter = 3;
        function addListItem() {
            listCounter++;
            const list = document.getElementById('dynamic-list');
            const li = document.createElement('li');
            li.innerHTML = `列表项 ${listCounter} - <span style="color: #007bff;">动态添加</span>`;
            list.appendChild(li);
        }

        let tableCounter = 3;
        function addTableRow() {
            tableCounter++;
            const tbody = document.querySelector('#data-table tbody');
            const tr = document.createElement('tr');
            const id = String(tableCounter).padStart(3, '0');
            tr.innerHTML = `
                <td>${id}</td>
                <td>项目 ${String.fromCharCode(64 + tableCounter)}</td>
                <td>新建</td>
                <td><a href="#" onclick="deleteRow(this); return false;">删除</a></td>
            `;
            tbody.appendChild(tr);
        }

        function deleteRow(link) {
            if (confirm('确定要删除这一行吗？')) {
                link.closest('tr').remove();
            }
        }

        function toggleAlert(alert) {
            alert.style.opacity = alert.style.opacity === '0.5' ? '1' : '0.5';
        }

        document.addEventListener('DOMContentLoaded', function() {
            console.log('页面加载完成！当前时间：' + new Date().toLocaleString());
        });
    </script>

</body>
</html>

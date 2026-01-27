'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminDashboardPage() {
  const [password, setPassword] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const loginStatus = localStorage.getItem('admin_logged_in')
    if (loginStatus === 'true') {
      setIsLoggedIn(true)
    }
  }, [])

  const handleLogin = (e: any) => {
    e.preventDefault()
    if (password === 'admin888') { 
      localStorage.setItem('admin_logged_in', 'true')
      setIsLoggedIn(true)
    } else {
      alert('密码错误')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('admin_logged_in')
    setIsLoggedIn(false)
    setPassword('')
  }

  // 已登录：显示导航菜单
  if (isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-10 flex flex-col items-center justify-center">
        <div className="max-w-4xl w-full text-center">
          <h1 className="text-4xl font-bold mb-4 tracking-tight">管理员控制台</h1>
          <p className="text-slate-400 mb-12">请选择要管理的项目 (点击将在新窗口打开)</p>
          
          <div className="grid gap-6 md:grid-cols-2">
            
            {/* 1. 创建工单 */}
            <a 
              href="/admin/create-order" 
              target="_blank" 
              className="bg-slate-800 p-8 rounded-xl border border-slate-700 hover:border-blue-500 hover:bg-slate-700 transition group text-left"
            >
              <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">📝</div>
              <div className="text-2xl font-bold mb-2">创建工单</div>
              <div className="text-slate-400 text-sm">生成新的收款链接发给客户</div>
            </a>

            {/* 2. 订单管理 */}
            <a 
              href="/admin/orders" 
              target="_blank" 
              className="bg-slate-800 p-8 rounded-xl border border-slate-700 hover:border-blue-500 hover:bg-slate-700 transition group text-left"
            >
              <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">🔍</div>
              <div className="text-2xl font-bold mb-2">订单审核与管理</div>
              <div className="text-slate-400 text-sm">实时监控 / 审核放行 / 历史查询</div>
            </a>

            {/* 3. 添加收款码 */}
            <a 
              href="/admin/qr" 
              target="_blank" 
              className="bg-slate-800 p-8 rounded-xl border border-slate-700 hover:border-blue-500 hover:bg-slate-700 transition group text-left"
            >
              <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">➕</div>
              <div className="text-2xl font-bold mb-2">添加收款码</div>
              <div className="text-slate-400 text-sm">上传新的二维码图片</div>
            </a>

            {/* 4. 收款码管理 */}
            <a 
              href="/admin/qr-manager" 
              target="_blank" 
              className="bg-slate-800 p-8 rounded-xl border border-slate-700 hover:border-blue-500 hover:bg-slate-700 transition group text-left"
            >
              <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">⚙️</div>
              <div className="text-2xl font-bold mb-2">收款码管理</div>
              <div className="text-slate-400 text-sm">修改状态 / 重置次数 / 删除</div>
            </a>
          </div>

          <button onClick={handleLogout} className="mt-16 text-slate-500 hover:text-white underline text-sm transition-colors">退出安全登录</button>
        </div>
      </div>
    )
  }

  // 未登录：显示密码框
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <form onSubmit={handleLogin} className="bg-slate-900 p-10 rounded-2xl border border-slate-800 w-full max-w-sm text-center shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-8 tracking-wider">SYSTEM LOGIN</h1>
        <input 
          type="password" 
          placeholder="PASSWORD" 
          className="w-full p-4 rounded-lg mb-6 bg-black text-white border border-slate-700 focus:border-blue-500 outline-none text-center tracking-widest transition-all"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button className="w-full bg-blue-600 text-white p-4 rounded-lg font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/50">ENTER DASHBOARD</button>
      </form>
    </div>
  )
}
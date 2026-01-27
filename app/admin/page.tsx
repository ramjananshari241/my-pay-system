'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminDashboardPage() {
  const [password, setPassword] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const loginStatus = localStorage.getItem('admin_logged_in')
    if (loginStatus === 'true') setIsLoggedIn(true)
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

  if (isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-10 flex flex-col items-center justify-center">
        <div className="max-w-4xl w-full text-center">
          <h1 className="text-4xl font-bold mb-4 tracking-tight">管理员控制台</h1>
          <p className="text-slate-400 mb-12">请选择要管理的项目</p>
          
          <div className="grid gap-6 md:grid-cols-2">
            {[
              { title: '创建工单', desc: '生成新的收款链接发给客户', link: '/admin/create-order', icon: '📝' },
              { title: '订单管理', desc: '实时监控 / 审核放行 / 屏蔽IP', link: '/admin/orders', icon: '🔍' },
              { title: '添加收款码', desc: '上传新的二维码图片', link: '/admin/qr', icon: '➕' },
              { title: '收款码管理', desc: '修改状态 / 重置次数 / 删除', link: '/admin/qr-manager', icon: '⚙️' }
            ].map((item, index) => (
              <a 
                key={index}
                href={item.link}
                target="_blank" 
                rel="noopener noreferrer" // 强制新窗口打开的标准写法
                className="bg-slate-800 p-8 rounded-xl border border-slate-700 hover:border-blue-500 hover:bg-slate-700 transition group text-left cursor-pointer"
              >
                <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">{item.icon}</div>
                <div className="text-2xl font-bold mb-2">{item.title}</div>
                <div className="text-slate-400 text-sm">{item.desc}</div>
              </a>
            ))}
          </div>

          <button onClick={handleLogout} className="mt-16 text-slate-500 hover:text-white underline text-sm transition-colors">退出安全登录</button>
        </div>
      </div>
    )
  }

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
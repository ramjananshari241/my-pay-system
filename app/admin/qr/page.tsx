'use client'

import { useState } from 'react'
import { supabase } from '@/utils/supabase' // 如果报错，记得改成 ../../../utils/supabase

export default function AddQrPage() {
  const [name, setName] = useState('')
  const [groupName, setGroupName] = useState('集合1')
  const [limit, setLimit] = useState(4)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: any) => {
    e.preventDefault()

    if (!file || !name) {
      alert('请填写名称并上传图片！')
      return
    }

    setLoading(true)

    try {
      // --- 修改点开始：生成安全的文件名 ---
      // 1. 获取文件后缀名 (比如 jpg, png)
      const fileExt = file.name.split('.').pop()
      // 2. 生成纯数字+字母的文件名 (时间戳 + 随机数)
      // 这样无论你原来的文件名里有空格、中文还是特殊符号，都不会报错了
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`
      // --- 修改点结束 ---

      // 1. 上传图片
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('images')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      // 2. 获取链接
      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(fileName)

      // 3. 存入数据库
      const { error: dbError } = await supabase
        .from('qr_codes')
        .insert([
          {
            name: name,
            group_name: groupName,
            daily_limit: limit,
            image_url: publicUrl,
            status: 'active',
            today_usage: 0
          }
        ])

      if (dbError) throw dbError

      alert('收款码添加成功！')
      setName('')
      setFile(null)
      // 这里的 value 也要重置，防止input显示残留
      const fileInput = document.getElementById('fileInput') as HTMLInputElement
      if(fileInput) fileInput.value = ''
      
    } catch (error: any) {
      console.error(error)
      alert('出错了：' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-10">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold mb-6">添加收款码 (管理员)</h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-1 font-medium">名称/编号</label>
            <input
              type="text"
              className="w-full border border-gray-600 bg-gray-800 p-2 rounded text-white"
              placeholder="例如：支付宝-01"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block mb-1 font-medium">分组 (集合)</label>
            <select
              className="w-full border border-gray-600 bg-gray-800 p-2 rounded text-white"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            >
              <option value="集合1">支付宝</option>
              <option value="集合2">微信</option>
              <option value="集合3">USDT</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 font-medium">每日收款次数限制</label>
            <input
              type="number"
              className="w-full border border-gray-600 bg-gray-800 p-2 rounded text-white"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block mb-1 font-medium">上传二维码图片</label>
            <input
              id="fileInput"
              type="file"
              accept="image/*"
              className="w-full border border-gray-600 bg-gray-800 p-2 rounded text-white"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setFile(e.target.files[0])
                }
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white p-3 rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? '正在保存...' : '保存收款码'}
          </button>
        </form>
      </div>
    </div>
  )
}
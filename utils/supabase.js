import { createClient } from '@supabase/supabase-js'

// 检查环境变量是否读取成功
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// 如果没有这两行，就导出一个空对象，防止报错（为了调试）
if (!supabaseUrl || !supabaseKey) {
  console.error('错误：Supabase 的 URL 或 Key 未设置，请检查 .env.local 文件')
}

// 这一行最关键，必须要有 export const
export const supabase = createClient(supabaseUrl || '', supabaseKey || '')
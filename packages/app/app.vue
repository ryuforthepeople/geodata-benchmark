<template>
  <div class="min-h-screen bg-gray-50">
    <nav class="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-8">
      <h1 class="text-lg font-bold text-gray-900 tracking-tight">
        🌍 Geodata Benchmark
      </h1>
      <div class="flex gap-1">
        <NuxtLink
          to="/"
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="$route.path === '/' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'"
        >
          Map Query
        </NuxtLink>
        <NuxtLink
          to="/dashboard"
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="$route.path === '/dashboard' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'"
        >
          Dashboard
        </NuxtLink>
      </div>
      <div class="ml-auto flex items-center gap-3 text-xs text-gray-400">
        <span class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-postgis"></span> PostGIS
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-mssql"></span> SQL Server
        </span>
      </div>
    </nav>
    <NuxtPage />
  </div>
</template>

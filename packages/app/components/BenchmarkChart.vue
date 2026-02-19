<template>
  <div class="bg-white rounded-xl border border-gray-200 p-5">
    <h3 class="text-sm font-semibold text-gray-900 mb-4">{{ title }}</h3>
    <div class="h-64">
      <Bar v-if="chartData" :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const props = defineProps<{
  title: string
  postgisTimes: { label: string; avgMs: number; p95Ms: number }[]
  mssqlTimes: { label: string; avgMs: number; p95Ms: number }[]
}>()

const chartData = computed(() => {
  const labels = props.postgisTimes.map(t => t.label)
  return {
    labels,
    datasets: [
      {
        label: 'PostGIS (avg)',
        data: props.postgisTimes.map(t => t.avgMs),
        backgroundColor: '#3b82f6',
        borderRadius: 4,
      },
      {
        label: 'SQL Server (avg)',
        data: props.mssqlTimes.map(t => t.avgMs),
        backgroundColor: '#ef4444',
        borderRadius: 4,
      },
      {
        label: 'PostGIS (p95)',
        data: props.postgisTimes.map(t => t.p95Ms),
        backgroundColor: '#93c5fd',
        borderRadius: 4,
      },
      {
        label: 'SQL Server (p95)',
        data: props.mssqlTimes.map(t => t.p95Ms),
        backgroundColor: '#fca5a5',
        borderRadius: 4,
      },
    ],
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: { boxWidth: 12, padding: 16, font: { size: 11 } },
    },
    tooltip: {
      callbacks: {
        label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}ms`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: 'Time (ms)', font: { size: 11 } },
    },
  },
}
</script>

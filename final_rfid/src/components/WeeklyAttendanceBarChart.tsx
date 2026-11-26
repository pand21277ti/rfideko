import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { AttendanceRecord, Student } from '../types';
import { AttendanceStorage } from '../lib/storage';
import { formatChartDate, formatToDDMMYYYY } from '../lib/dateUtils';
import { BarChart3, TrendingUp, Clock, Users } from 'lucide-react';

interface WeeklyAttendanceBarChartProps {
  records?: AttendanceRecord[];
  students?: Student[];
  className?: string;
}

interface DailyAttendancePoint {
  dateKey: string;
  displayDate: string;
  fullDate: string;
  onTime: number;
  late: number;
  totalPresent: number;
  totalStudents: number;
  percentage: number;
}

export const WeeklyAttendanceBarChart: React.FC<WeeklyAttendanceBarChartProps> = ({
  records: propRecords,
  students: propStudents,
  className = ''
}) => {
  const records = useMemo(() => {
    return propRecords || (typeof window !== 'undefined' ? AttendanceStorage.getAttendanceRecords() : []);
  }, [propRecords]);

  const students = useMemo(() => {
    return propStudents || (typeof window !== 'undefined' ? AttendanceStorage.getStudents() : []);
  }, [propStudents]);

  const totalStudents = students.length || 1;

  // Build 7-day data sequence ending today
  const chartData = useMemo<DailyAttendancePoint[]>(() => {
    const points: DailyAttendancePoint[] = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      const fullDate = formatToDDMMYYYY(dateKey);
      const displayDate = formatChartDate(dateKey);

      // Filter student attendance records for this dateKey
      const dayRecords = records.filter(r => {
        const isStudent = r.userType === 'STUDENT' || (!r.userType && !r.teacherId);
        return isStudent && r.dateFormatted === dateKey;
      });

      // Count unique students by entry status
      const studentMap = new Map<string, AttendanceRecord>();
      for (const rec of dayRecords) {
        const sId = rec.studentId || rec.rfidUid;
        if (!studentMap.has(sId)) {
          studentMap.set(sId, rec);
        } else if (rec.type === 'MASUK') {
          studentMap.set(sId, rec);
        }
      }

      let onTime = 0;
      let late = 0;

      for (const rec of studentMap.values()) {
        if (rec.status === 'TERLAMBAT' || rec.notes?.toLowerCase().includes('terlambat')) {
          late++;
        } else {
          onTime++;
        }
      }

      const totalPresent = onTime + late;
      const percentage = Math.min(100, Math.round((totalPresent / totalStudents) * 100));

      points.push({
        dateKey,
        displayDate,
        fullDate,
        onTime,
        late,
        totalPresent,
        totalStudents,
        percentage
      });
    }

    return points;
  }, [records, totalStudents]);

  // Summary statistics for the 7-day period
  const stats = useMemo(() => {
    const totalWeeklyPresent = chartData.reduce((acc, p) => acc + p.totalPresent, 0);
    const totalWeeklyLate = chartData.reduce((acc, p) => acc + p.late, 0);
    const avgPercentage = Math.round(
      chartData.reduce((acc, p) => acc + p.percentage, 0) / chartData.length
    );

    // Day with highest attendance
    const highestDay = [...chartData].sort((a, b) => b.totalPresent - a.totalPresent)[0];

    return {
      totalWeeklyPresent,
      totalWeeklyLate,
      avgPercentage,
      highestDate: highestDay ? `${highestDay.fullDate} (${highestDay.totalPresent} siswa)` : '-'
    };
  }, [chartData]);

  return (
    <div className={`card-container space-y-4 ${className}`}>
      {/* Header and Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
              Tren Kehadiran Siswa 7 Hari Terakhir
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                DD-MM-YYYY
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Grafik batang bertumpuk membedakan hadir tepat waktu dan terlambat per hari
            </p>
          </div>
        </div>

        {/* Quick Micro Stat Chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-xs">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Rata-rata:</span>
            <span className="font-mono font-bold text-emerald-300">{stats.avgPercentage}%</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-xs">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">Terlambat:</span>
            <span className="font-mono font-bold text-amber-300">{stats.totalWeeklyLate}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-xs">
            <Users className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400">Puncak:</span>
            <span className="font-mono font-bold text-slate-200">{stats.highestDate}</span>
          </div>
        </div>
      </div>

      {/* Recharts Stacked Bar Chart */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 sm:p-4">
        <div className="h-64 sm:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 15, left: -10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.35} vertical={false} />
              <XAxis
                dataKey="displayDate"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as DailyAttendancePoint;
                    return (
                      <div className="bg-slate-900/95 border border-slate-700 rounded-lg p-3 shadow-xl text-xs space-y-1.5 min-w-[190px]">
                        <div className="font-bold text-slate-200 border-b border-slate-800 pb-1 flex justify-between items-center">
                          <span>{data.fullDate}</span>
                          <span className="font-mono text-emerald-400 font-extrabold">{data.percentage}%</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-slate-300">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                              Tepat Waktu:
                            </span>
                            <span className="font-mono font-bold text-emerald-400">{data.onTime} siswa</span>
                          </div>
                          <div className="flex justify-between items-center text-slate-300">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
                              Terlambat:
                            </span>
                            <span className="font-mono font-bold text-amber-400">{data.late} siswa</span>
                          </div>
                          <div className="flex justify-between items-center text-slate-400 border-t border-slate-800 pt-1">
                            <span>Total Hadir:</span>
                            <span className="font-mono font-bold text-white">{data.totalPresent} / {data.totalStudents}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ paddingBottom: '12px', fontSize: '11px' }}
                formatter={(val) => <span className="text-slate-300 font-medium text-xs mr-2">{val}</span>}
              />
              <Bar
                dataKey="onTime"
                name="Tepat Waktu"
                stackId="attendance"
                fill="#10b981"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="late"
                name="Terlambat"
                stackId="attendance"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

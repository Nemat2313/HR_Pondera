'use client';

import React, { useState } from 'react';
import {
  ChevronRight,
  Building2,
  MapPin,
  Briefcase,
  Users,
  Layers,
  FileSpreadsheet,
  GitBranch,
} from 'lucide-react';
import { TreeRegion } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

interface PowerBIDecompositionTreeProps {
  treeData: TreeRegion[];
  totalCount: number;
  onSelectNode: (type: 'region' | 'project' | 'department', value: string) => void;
  onOpenDetail?: (type: 'region' | 'project' | 'department', value: string) => void;
}

const CARD_HEIGHT = 68; // px
const CARD_GAP = 10; // px
const CARD_TOTAL = CARD_HEIGHT + CARD_GAP;

export default function PowerBIDecompositionTree({
  treeData,
  totalCount,
  onSelectNode,
  onOpenDetail,
}: PowerBIDecompositionTreeProps) {
  const { lang, t } = useLanguage();
  const [selectedRegion, setSelectedRegion] = useState<string>(treeData[0]?.name || 'Kazan');
  const [selectedProject, setSelectedProject] = useState<string>(
    treeData[0]?.projects[0]?.name || 'NHNK mPE-300'
  );

  const activeRegionIndex = Math.max(
    0,
    treeData.findIndex((r) => r.name === selectedRegion)
  );
  const activeRegionObj = treeData[activeRegionIndex] || treeData[0];
  const activeProjects = activeRegionObj?.projects || [];

  const activeProjectIndex = Math.max(
    0,
    activeProjects.findIndex((p) => p.name === selectedProject)
  );
  const activeProjectObj = activeProjects[activeProjectIndex] || activeProjects[0];
  const activeDepartments = activeProjectObj?.departments || [];

  // Y center calculation for SVG tree branch lines
  const regionParentY = activeRegionIndex * CARD_TOTAL + CARD_HEIGHT / 2;
  const projectParentY = activeProjectIndex * CARD_TOTAL + CARD_HEIGHT / 2;

  return (
    <div className="p-4 sm:p-5 lg:p-6 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-2xl relative overflow-hidden transition-colors">
      {/* Background glow effects (dark mode only) */}
      <div className="hidden dark:block absolute top-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="hidden dark:block absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 border-b border-slate-200 dark:border-slate-800 pb-3 relative z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-teal-500/20 text-emerald-600 dark:text-teal-400 border border-emerald-200 dark:border-teal-500/30">
              <GitBranch className="w-4 h-4" />
            </span>
            <h2 className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              {t('decomp_title')}
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-teal-950/80 text-emerald-800 dark:text-teal-300 border border-emerald-200 dark:border-teal-600/40 text-[10px] font-bold">
              {lang === 'ru' ? 'Движок Power BI' : 'Power BI Motoru'}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {lang === 'ru' 
              ? 'Корень: Всего → Регион → Проект / Объект → Отдел' 
              : 'Kök: Toplam → Bölge → Şantiye / Proje → Departman dallanmasını dinamik ağaç çizgileriyle inceleyin.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenDetail && (
            <button
              onClick={() => onOpenDetail('region', selectedRegion)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 border border-emerald-200 dark:border-teal-500/40 text-emerald-700 dark:text-teal-300 text-xs font-bold transition-all shadow-xs cursor-pointer"
              title={lang === 'ru' ? 'Открыть список персонала' : 'Seçili Kırılımın Detay Personel Listesini Aç'}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-teal-400" />
              <span>{lang === 'ru' ? `Список (${selectedRegion})` : `Detay Gör (${selectedRegion})`}</span>
            </button>
          )}
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 ml-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-teal-400 animate-pulse" />
            {lang === 'ru' ? 'Ветвление активно' : 'Ağaç Dallanması Aktif'}
          </span>
        </div>
      </div>

      {/* HORIZONTAL DECOMPOSITION TREE CONTAINER */}
      <div className="overflow-x-auto pb-2 relative z-10">
        <div className="min-w-[900px] flex items-start gap-0">
          {/* LEVEL 0: ROOT (TOPLAM ÇALIŞAN) */}
          <div className="w-[200px] shrink-0 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-teal-300 uppercase tracking-wider mb-2">
              <Users className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Корень: Всего' : 'Kök: Toplam'}</span>
            </div>

            <div
              onClick={() => onSelectNode('region', 'all')}
              className="h-[68px] p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-slate-100 dark:from-teal-900/60 dark:to-slate-800 border-2 border-emerald-500/80 dark:border-teal-400/80 shadow-xs dark:shadow-lg dark:shadow-teal-950/50 cursor-pointer hover:border-emerald-600 dark:hover:border-teal-300 transition-all flex flex-col justify-between group relative"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 dark:text-teal-200">
                  {lang === 'ru' ? 'Штат Pondera' : 'Pondera Kadrosu'}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-200/80 dark:bg-teal-500/30 text-emerald-900 dark:text-teal-200 font-black">
                  100%
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-lg font-black text-slate-900 dark:text-white font-mono">
                  {totalCount.toLocaleString('tr-TR')}
                </span>
                <span className="text-[10px] text-emerald-700 dark:text-teal-300 font-semibold flex items-center gap-0.5">
                  {lang === 'ru' ? 'Все →' : 'Tümü →'}
                </span>
              </div>

              {/* Branch Output Port */}
              <div className="hidden md:block absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-emerald-500 dark:bg-teal-400 border-2 border-white dark:border-slate-900 z-10 shadow-xs" />
            </div>
          </div>

          {/* CONNECTOR 0 -> 1 (ROOT TO SELECTED REGION) */}
          <div className="hidden md:block w-8 shrink-0 relative self-stretch">
            <svg className="w-full h-full overflow-visible pointer-events-none">
              <path
                d={`M 0,34 C 16,34 16,${regionParentY} 32,${regionParentY}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-emerald-500 dark:text-teal-400 opacity-80"
              />
              <circle
                cx={32}
                cy={regionParentY}
                r={3}
                className="fill-emerald-600 dark:fill-teal-300"
              />
            </svg>
          </div>

          {/* LEVEL 1: BÖLGESİ (REGIONS) */}
          <div className="w-[220px] shrink-0 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-teal-300 uppercase tracking-wider mb-2">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Регион / Участок' : 'Bölgesi (Region)'}</span>
              </span>
              <span className="text-[10px] text-slate-500 font-normal">({treeData.length})</span>
            </div>

            <div className="space-y-2.5">
              {treeData.map((reg) => {
                const isSelected = selectedRegion === reg.name;
                const pct = totalCount > 0 ? Math.round((reg.count / totalCount) * 100) : 0;

                return (
                  <div
                    key={reg.name}
                    onClick={() => {
                      setSelectedRegion(reg.name);
                      setSelectedProject(reg.projects[0]?.name || '');
                      onSelectNode('region', reg.name);
                    }}
                    className={`h-[68px] p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between relative group ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-teal-900/70 border-emerald-500 dark:border-teal-400 text-slate-900 dark:text-white shadow-xs dark:shadow-md dark:shadow-teal-950/40 ring-2 ring-emerald-500/30 dark:ring-teal-400/40'
                        : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:bg-emerald-50/40 dark:hover:bg-slate-800 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold truncate max-w-[125px]">{reg.name}</span>
                      <span className="font-black text-emerald-700 dark:text-teal-300 font-mono">
                        {reg.count.toLocaleString('tr-TR')}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-slate-200 dark:bg-slate-700/70 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(8, pct))}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                      <span>%{pct} {lang === 'ru' ? 'доля' : 'pay'}</span>
                      <span className="flex items-center gap-1 font-bold text-emerald-700 dark:text-teal-300">
                        <span>{reg.projects.length} {lang === 'ru' ? 'Объект' : 'Şantiye'}</span>
                        <span className="text-[11px] font-black">{isSelected ? '[-]' : '[+]'}</span>
                      </span>
                    </div>

                    {/* Branch Port Indicator */}
                    {isSelected && (
                      <div className="hidden md:block absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-emerald-500 dark:bg-teal-400 border-2 border-white dark:border-slate-900 z-10 shadow-xs" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* CONNECTOR 1 -> 2 (SELECTED REGION TO CHILD PROJECTS) */}
          <div className="hidden md:block w-8 shrink-0 relative self-stretch">
            <svg className="w-full h-full overflow-visible pointer-events-none">
              {activeProjects.map((_, pIdx) => {
                const childY = pIdx * CARD_TOTAL + CARD_HEIGHT / 2;
                return (
                  <g key={`branch-p-${pIdx}`}>
                    <path
                      d={`M 0,${regionParentY} C 16,${regionParentY} 16,${childY} 32,${childY}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-emerald-500 dark:text-teal-400 opacity-75"
                    />
                    <circle
                      cx={32}
                      cy={childY}
                      r={2.5}
                      className="fill-emerald-600 dark:fill-teal-300"
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* LEVEL 2: ŞANTİYE / PROJE ADI */}
          <div className="w-[230px] shrink-0 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-teal-300 uppercase tracking-wider mb-2">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Проект / Объект' : 'Şantiye / Proje'}</span>
              </span>
              <span className="text-[10px] text-slate-500 font-normal truncate max-w-[85px]">
                {selectedRegion}
              </span>
            </div>

            <div className="space-y-2.5">
              {activeProjects.map((prj) => {
                const isSelected = selectedProject === prj.name;
                const regTotal = activeRegionObj?.count || 1;
                const pctOfRegion = Math.round((prj.count / regTotal) * 100);

                return (
                  <div
                    key={prj.name}
                    onClick={() => {
                      setSelectedProject(prj.name);
                      onSelectNode('project', prj.name);
                    }}
                    className={`h-[68px] p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between relative group ${
                      isSelected
                        ? 'bg-cyan-50 dark:bg-cyan-900/70 border-cyan-500 dark:border-cyan-400 text-slate-900 dark:text-white shadow-xs dark:shadow-md dark:shadow-cyan-950/40 ring-2 ring-cyan-500/30 dark:ring-cyan-400/40'
                        : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:bg-cyan-50/40 dark:hover:bg-slate-800 hover:border-cyan-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold truncate max-w-[130px]">{prj.name}</span>
                      <span className="font-black text-cyan-600 dark:text-cyan-300 font-mono">
                        {prj.count.toLocaleString('tr-TR')}
                      </span>
                    </div>

                    <div className="w-full bg-slate-200 dark:bg-slate-700/70 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(10, pctOfRegion))}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                      <span>{lang === 'ru' ? 'В регионе: %' : 'Bölge içi: %'}{pctOfRegion}</span>
                      <span className="flex items-center gap-1 font-bold text-cyan-600 dark:text-cyan-300">
                        <span>{prj.departments.length} {lang === 'ru' ? 'Отдел' : 'Ekip'}</span>
                        <span className="text-[11px] font-black">{isSelected ? '[-]' : '[+]'}</span>
                      </span>
                    </div>

                    {/* Branch Port Indicator */}
                    {isSelected && (
                      <div className="hidden md:block absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-cyan-500 dark:bg-cyan-400 border-2 border-white dark:border-slate-900 z-10 shadow-xs" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* CONNECTOR 2 -> 3 (SELECTED PROJECT TO CHILD DEPARTMENTS) */}
          <div className="hidden md:block w-8 shrink-0 relative self-stretch">
            <svg className="w-full h-full overflow-visible pointer-events-none">
              {activeDepartments.map((_, dIdx) => {
                const childY = dIdx * CARD_TOTAL + CARD_HEIGHT / 2;
                return (
                  <g key={`branch-d-${dIdx}`}>
                    <path
                      d={`M 0,${projectParentY} C 16,${projectParentY} 16,${childY} 32,${childY}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-cyan-500 dark:text-cyan-400 opacity-75"
                    />
                    <circle
                      cx={32}
                      cy={childY}
                      r={2.5}
                      className="fill-cyan-600 dark:fill-cyan-300"
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* LEVEL 3: DEPARTMAN / EKİP */}
          <div className="w-[250px] shrink-0 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-teal-300 uppercase tracking-wider mb-2">
              <span className="flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Отдел / Служба' : 'Departman / Ekip'}</span>
              </span>
              <span className="text-[10px] text-slate-500 font-normal truncate max-w-[95px]">
                {selectedProject}
              </span>
            </div>

            <div className="space-y-2.5">
              {activeDepartments.map((dpt, idx) => {
                const prjTotal = activeProjectObj?.count || 1;
                const pctOfPrj = Math.round((dpt.count / prjTotal) * 100);

                return (
                  <div
                    key={idx}
                    onClick={() => onSelectNode('department', dpt.name)}
                    className="h-[68px] p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-700 dark:text-slate-300 hover:border-emerald-400 dark:hover:border-teal-400 hover:bg-emerald-50/50 dark:hover:bg-slate-800 transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white truncate max-w-[145px] group-hover:text-emerald-600 dark:group-hover:text-teal-300">
                        {dpt.name}
                      </span>
                      <span className="font-black text-emerald-600 dark:text-teal-400 font-mono">
                        {dpt.count.toLocaleString('tr-TR')}
                      </span>
                    </div>

                    <div className="w-full bg-slate-200 dark:bg-slate-700/70 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 dark:bg-teal-400 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(12, pctOfPrj))}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                      <span>{lang === 'ru' ? 'В проекте: %' : 'Proje içi: %'}{pctOfPrj}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenDetail) onOpenDetail('department', dpt.name);
                        }}
                        className="text-emerald-700 dark:text-teal-300 hover:text-emerald-900 dark:hover:text-white font-bold group-hover:underline cursor-pointer"
                      >
                        {t('btn_see_in_list')} &rarr;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

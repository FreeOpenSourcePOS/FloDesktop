'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import PrinterStatus from './PrinterStatus';
import CustomerSearch from './CustomerSearch';

export default function PosTopbar() {
  return (
    <div className="
      grid items-center gap-x-2 border-b bg-white shrink-0 px-4
      grid-cols-[auto_1fr_auto] gap-y-2 py-2
      md:grid-cols-[auto_auto_1fr_auto] md:h-12 md:py-0 md:gap-y-0
    ">
      {/* Col 1, Row 1: sidebar toggle */}
      <SidebarTrigger className="-ml-1" />

      {/* Col 2, Row 1: separator — desktop only */}
      <Separator orientation="vertical" className="!h-4 hidden md:block" />

      {/* Customer search:
          Mobile  → col 1-3, row 2 (full width below toggle+printer)
          Desktop → col 3,   row 1 (fills remaining space) */}
      <div className="col-span-3 row-start-2 md:col-span-1 md:col-start-3 md:row-start-1">
        <CustomerSearch variant="topbar" />
      </div>

      {/* Printer status:
          Mobile  → col 3, row 1 (right side, same row as toggle)
          Desktop → col 4, row 1 */}
      <div className="col-start-3 row-start-1 md:col-start-4 md:row-start-1">
        <PrinterStatus />
      </div>
    </div>
  );
}

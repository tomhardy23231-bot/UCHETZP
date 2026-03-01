// components/GridView.jsx
import React from 'react';
import EmployeeCard from './EmployeeCard';

const GridView = ({
  employees,
  attendanceData,
  draftTimes,
  getDraftKey,
  handleTimeInputChange,
  commitTimeChange,
  handleTimeKeyDown,
  handlePaste,
  isValidHHMM,
  calculateDuration,
  getAvatarColor,
  selectedMonth,
  getDaysInMonth,
  getRecord,
  onCardClick,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
      {employees.map((employee) => (
        <EmployeeCard
          key={employee.id}
          employee={employee}
          attendanceData={attendanceData}
          draftTimes={draftTimes}
          getDraftKey={getDraftKey}
          handleTimeInputChange={handleTimeInputChange}
          commitTimeChange={commitTimeChange}
          handleTimeKeyDown={handleTimeKeyDown}
          handlePaste={handlePaste}
          isValidHHMM={isValidHHMM}
          calculateDuration={calculateDuration}
          getAvatarColor={getAvatarColor}
          selectedMonth={selectedMonth}
          getDaysInMonth={getDaysInMonth}
          getRecord={getRecord}
          onCardClick={onCardClick}
        />
      ))}
    </div>
  );
};

export default GridView;
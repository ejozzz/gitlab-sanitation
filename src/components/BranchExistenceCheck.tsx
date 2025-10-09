// //app/components/BranchExistenceCheck.tsx
// 'use client';

// import { useState } from 'react';
// import { useQuery } from '@tanstack/react-query';

// export default function BranchExistenceCheck() {
//   const [branchName, setBranchName] = useState('');
//   const [checkName, setCheckName] = useState('');

//   const { data: result, isLoading } = useQuery({
//     queryKey: ['branch-check', checkName],
//     queryFn: async () => {
//       if (!checkName) return null;
      
//       const response = await fetch(`/api/gitlab/branches/check?name=${encodeURIComponent(checkName)}`);
//       if (!response.ok) throw new Error('Failed to check branch');
//       return response.json();
//     },
//     enabled: !!checkName,
//   });

//   const handleCheck = () => {
//     setCheckName(branchName);
//   };

//   return (
//     <div className="flex items-center gap-2">
//       <input
//         type="text"
//         placeholder="Check if branch exists"
//         className="input input-bordered input-sm"
//         value={branchName}
//         onChange={(e) => setBranchName(e.target.value)}
//         onKeyPress={(e) => e.key === 'Enter' && handleCheck()}
//       />
//       <button
//         className="btn btn-primary btn-sm"
//         onClick={handleCheck}
//         disabled={isLoading}
//       >
//         {isLoading ? <span className="loading loading-spinner loading-xs"></span> : 'Check'}
//       </button>
      
//       {result && (
//         <div className={`badge ${result.exists ? 'badge-success' : 'badge-error'} gap-2`}>
//           {result.exists ? 'Exists' : 'Not Found'}
//         </div>
//       )}
//     </div>
//   );
// }
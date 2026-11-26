export const broadcastQuestions = [
  {
    "choices": [
      "2번째",
      "3번째",
      "4번째",
      "5번째"
    ],
    "label": "오류가 난 차례",
    "items": [
      "문 닫는 소리",
      "발소리",
      "박수",
      "북",
      "종",
      "휘파람"
    ],
    "answer": [
      "4번째",
      "종",
      "북",
      "휘파람",
      "발소리",
      "문 닫는 소리",
      "박수"
    ],
    "unit": "번 자리",
    "title": "고장 난 테이프 판독기",
    "body": "<p>여섯 장의 소리 카드가 한 줄로 놓여 있었다. 판독기가 카드를 모두 꺼낸 뒤, 방송부원에게는 재생 기록과 메모 한 장만 남았다.</p>\n<article><h3>판독 규칙</h3>판독기는 남은 줄의 양 끝에서 한 장씩 꺼낸다. 예정된 방향은 <b>왼쪽 → 오른쪽 → 왼쪽 → 오른쪽 → 왼쪽 → 오른쪽</b>이다. 2~5번째 중 딱 한 번 반대쪽에서 꺼냈고, 다음 차례부터는 원래 예정된 방향을 따랐다.\n<h3 style=\"margin-top:18px\">실제 재생 순서</h3><ol class=\"tape\"><li>종</li><li>박수</li><li>북</li><li>휘파람</li><li>발소리</li><li>문 닫는 소리</li></ol><h3>방송부원의 메모</h3><ul><li>처음에 박수 카드는 맨 오른쪽에 있었다.</li><li>북은 휘파람보다 왼쪽에 있었다.</li><li>발소리는 문 닫는 소리보다 왼쪽에 있었다.</li></ul></article>\n",
    "prompt": "오류가 난 차례와 원래 카드 배열을 복원하세요.",
    "sequence": "원래 배열 · 왼쪽 끝부터",
    "hint": "<p>마지막까지 남은 카드는 문 닫는 소리다. 오류가 난 차례를 하나 가정하고, 재생 순서를 거꾸로 따라가며 카드를 양 끝에 다시 붙여 보자.</p>",
    "solution": "<p><b>4번째 오류 · 종 → 북 → 휘파람 → 발소리 → 문 닫는 소리 → 박수</b></p><p>거꾸로 복원하면 2번째 오류일 때는 박수가 맨 오른쪽에 오지 않는다. 3번째라면 북이 휘파람보다 오른쪽이고, 5번째라면 발소리가 문보다 오른쪽이다. 4번째에만 세 메모가 모두 맞는다.</p>"
  },
  {
    "choices": [
      "①",
      "②",
      "③",
      "④",
      "⑤"
    ],
    "label": "거짓 기록",
    "items": [
      "박수",
      "종",
      "파도",
      "비",
      "북"
    ],
    "answer": [
      "③",
      "종",
      "파도",
      "박수"
    ],
    "unit": "번째 버튼",
    "title": "조작된 송출 일지",
    "body": "<p>방송 직전, 효과음 버튼의 배선이 뒤섞였다. 시험 방송 기록 다섯 줄 중 한 줄에는 실제와 다른 소리가 적혀 있다.</p>\n<article><h3>장비 점검 기록</h3><ul><li>버튼 다섯 개는 원래 이름과 같은 소리를 냈다. 서로 다른 두 쌍의 배선이 각각 맞바뀌었고, 남은 버튼 하나의 배선은 그대로다.</li><li>효과음 파일 하나가 지워졌다. 그 파일에 연결된 버튼은 항상 조용하다.</li><li>누른 버튼은 모두 정확하게 적혔다. 들린 소리는 딱 한 줄만 틀렸다. 한 줄 안에서 소리의 순서는 무시한다.</li></ul>\n<table><thead><tr><th>기록</th><th>누른 버튼</th><th>들린 소리</th></tr></thead><tbody><tr><td>①</td><td>파도 + 비</td><td>파도</td></tr><tr><td>②</td><td>종 + 북</td><td>종 + 북</td></tr><tr><td>③</td><td>종 + 비 + 북</td><td>박수 + 비</td></tr><tr><td>④</td><td>박수 + 종</td><td>비 + 북</td></tr><tr><td>⑤</td><td>박수 + 북</td><td>종 + 비</td></tr></tbody></table></article>\n",
    "prompt": "거짓 기록을 찾고 방송을 복구하세요.",
    "sequence": "<b>북 → 파도 → 비</b>가 들리려면 어떤 버튼을 차례대로 눌러야 할까?",
    "hint": "<p>②에서 누른 두 버튼을 ③에서도 모두 눌렀다. 버튼을 하나 더 눌렀다고 먼저 들리던 소리가 사라질 수 있을까?</p>",
    "solution": "<p><b>거짓 기록 ③ · 누를 버튼은 종 → 파도 → 박수</b></p><p>②와 ③ 중 하나는 거짓이다. ②가 거짓이면 나머지 네 줄에서 다섯 소리가 전부 들린다. 파일 하나가 지워졌으므로 불가능하다.</p><p>참인 ②와 ④의 공통 버튼은 종이고 공통 소리는 북이다. 따라서 종과 북의 배선이 서로 바뀌었다. ④의 다른 버튼인 박수는 비 소리를 내므로 박수와 비도 맞바뀌었다. 남은 파도 버튼은 그대로다. ①에서 비 버튼이 조용했으니 지워진 파일은 박수 소리다.</p>"
  }
];

export function renderBroadcast(scene, game, host, escape, leave) {
  const data=game.data;
  if (!data || data.stage<0) {
    scene.innerHTML='<header class="scene-heading"><h1 id="scene-title">6라운드 · 방송실 연결 중</h1></header><div class="scene-body"><p role="status"></p></div>';
    scene.querySelector('[role=status]').textContent=game.error || '선생님 화면과 진행 상태를 맞추고 있어요.';
    return;
  }
  const {stage}=data;
  if(stage===4){
    const board=data.board || [], first=board[0]?.total;
    const winners=board.filter(p=>p.total===first).map(p=>p.name);
    scene.innerHTML='<header class="scene-heading"><div><p class="section-label">7라운드 종료 · 누적 승점</p><h1 id="scene-title">'+
      (winners.length? (winners.length>1?'공동 우승 · ':'우승 · ')+escape(winners.join(', ')):'참가자 없음')+
      '</h1></div></header><div class="scene-body broadcast-round"><table><thead><tr><th>학생</th><th>1~5라운드</th><th>6~7라운드</th><th>총 승점</th></tr></thead><tbody>'+
      board.map(p=>'<tr><th>'+escape(p.name)+'</th><td>'+p.base+'</td><td>'+p.extra+'</td><td><b>'+p.total+'</b></td></tr>').join('')+
      '</tbody></table><button type="button" class="button quiet">'+(host?'새 판 준비':'입장 화면으로')+'</button></div>';
    scene.querySelector('button').onclick=leave;
    return;
  }
  const index=Math.floor(stage/2), q=broadcastQuestions[index], reveal=stage%2===1;
  const sent=data.mine?.[index]!=null, waiting=game.pending?.stage===stage;
  const header='<header class="scene-heading"><div><p class="section-label">'+(6+index)+' / 7라운드 · '+(reveal?'정답과 풀이':'문제 풀이')+'</p><h1 id="scene-title">'+q.title+'</h1></div></header>';
  scene.innerHTML=header+'<div class="scene-body broadcast-round">'+q.body+
    (reveal?q.solution:'<details><summary>힌트 보기</summary>'+q.hint+'</details>')+
    (host?'<p id="extra-count"></p><button type="button" class="button primary" data-next>'+
      (reveal?(index?'최종 순위 발표':'7라운드 열기'):'제출 마감 · 풀이 공개')+'</button>':
      reveal?'<p role="status">'+(sent?(data.mine[index]?'정답 · 1승점':'오답 · 0승점'):'미제출 · 0승점')+'</p>':
      sent||waiting?'<p role="status">'+(sent?'제출 완료. 선생님이 풀이를 공개하면 결과가 열립니다.':'답안을 보내는 중입니다. 연결되면 자동으로 다시 보냅니다.')+'</p>':
      '<form><h2>'+q.prompt+'</h2><div data-first></div><p>'+q.sequence+'</p><div class="broadcast-slots"></div><p aria-live="polite"></p><button class="button primary">답 제출</button></form>')+'</div>';
  if(host){
    scene.querySelector('#extra-count').textContent='제출 '+data.submitted+' / '+data.count+'명';
    const nextButton=scene.querySelector('[data-next]');
    if(!game.ready){
      nextButton.disabled=true;
      nextButton.textContent=game.error || '교실 연결 복구 중';
    }
    nextButton.onclick=()=>{
      const now=game.data;
      if(!reveal && now.submitted<now.count && !confirm('아직 제출하지 않은 학생이 있습니다. 제출을 마감할까요?'))return;
      game.advance(stage);
    };
  } else if(!reveal && !sent && !waiting){
    const form=scene.querySelector('form'), saved=game.draft(stage);
    const fields=q.answer.map((_,n)=>{
      const label=document.createElement('label'), select=document.createElement('select');
      label.textContent=n?n+q.unit:q.label;
      select.required=true;select.add(new Option('선택',''));
      for(const value of n?q.items:q.choices) select.add(new Option(value,value));
      select.value=saved[n]||'';label.append(select);
      form.querySelector(n?'.broadcast-slots':'[data-first]').append(label);return select;
    });
    const values=()=>fields.map(el=>el.value);
    form.onchange=()=>{game.draft(stage,values());form.querySelector('[aria-live]').textContent='';};
    form.onsubmit=e=>{
      e.preventDefault();
      const picks=values();
      if(index===0 && new Set(picks.slice(1)).size!==6){
        form.querySelector('[aria-live]').textContent='카드 여섯 장을 한 번씩 놓아 주세요.';return;
      }
      game.answer(stage,picks);
    };
  }
}

# Web transport end-to-end test, run under Node (no browser). See README.md.
if(EMSCRIPTEN)
  add_executable(gate_hello_ws ${CMAKE_CURRENT_LIST_DIR}/gate_hello_ws.cpp)
  target_link_libraries(gate_hello_ws PRIVATE yo2net)   # yo2net adds -lwebsocket.js
  target_link_options(gate_hello_ws PRIVATE -sENVIRONMENT=node -sEXIT_RUNTIME=1)
endif()
